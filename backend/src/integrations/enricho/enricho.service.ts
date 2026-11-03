import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import { config } from '../../config';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { getCredentialView, saveApiKey, updateCredentialStatus } from '../../services/credentials.service';
import { buildCompanySearchArgs, buildPeopleSearchArgs, type BuiltArgs, type CompanySearchFilters, type PeopleSearchFilters } from './args';
import { callTool, classifyMcpError, classifyToolErrorText, listTools, withEnrichoMcp, type McpToolInfo } from './mcp.client';
import { extractRecords, normalizeCompany, normalizePerson, parseToolPayload, type NormalizedCompany, type NormalizedPerson } from './normalize';
import { EnrichoOAuthProvider } from './oauth.provider';

/*
 * Enricho (https://enricho.co) over MCP at https://mcp.enricho.co/mcp.
 * Documented tools: company_search, person_search (free preview, 5 credits per full record),
 * account_usage (free), find_jobs, find_profiles. Tool names are taken from the live
 * tools/list response; nothing here calls a tool the server did not advertise.
 */

export type Capability = 'companySearch' | 'peopleSearch' | 'account';

export function mapCapabilities(tools: McpToolInfo[]): Record<Capability, string | null> {
  const names = tools.map((t) => t.name);
  const exact = (n: string) => (names.includes(n) ? n : null);
  const fuzzy = (re: RegExp, not?: RegExp) => names.find((n) => re.test(n) && !(not && not.test(n))) ?? null;
  return {
    companySearch: exact('company_search') ?? fuzzy(/compan.*search|search.*compan/i),
    peopleSearch: exact('person_search') ?? fuzzy(/(person|people).*search|search.*(person|people)/i),
    account: exact('account_usage') ?? fuzzy(/usage|current_?user|account/i, /buy|billing|portal/i),
  };
}

interface ToolCatalog {
  tools: McpToolInfo[];
  capabilities: Record<Capability, string | null>;
  fetchedAt: string;
}

const CATALOG_TTL_MS = 60 * 60 * 1000;

async function storeCatalog(userId: string, tools: McpToolInfo[], extra: Record<string, unknown> = {}) {
  const catalog: ToolCatalog = { tools, capabilities: mapCapabilities(tools), fetchedAt: new Date().toISOString() };
  await updateCredentialStatus(userId, 'ENRICHO', 'CONNECTED', null, { toolCatalog: catalog, ...extra });
  return catalog;
}

export async function refreshToolCatalog(userId: string): Promise<ToolCatalog> {
  try {
    const tools = await withEnrichoMcp(userId, 'tools/list', (client) => listTools(client));
    return await storeCatalog(userId, tools);
  } catch (err) {
    const appErr = classifyMcpError(err);
    if (appErr.code === 'PROVIDER_AUTH') await updateCredentialStatus(userId, 'ENRICHO', 'ERROR', appErr.message);
    throw appErr;
  }
}

export async function getToolCatalog(userId: string): Promise<ToolCatalog> {
  const view = await getCredentialView(userId, 'ENRICHO');
  if (!view?.configured) {
    throw new AppError('NOT_CONFIGURED', 'Enricho is not connected. Add your enr_ API key or sign in with Enricho in Settings → Integrations.', { provider: 'ENRICHO' });
  }
  const cached = view.metadata.toolCatalog as ToolCatalog | undefined;
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < CATALOG_TTL_MS && cached.capabilities.companySearch !== undefined) return cached;
  return refreshToolCatalog(userId);
}

async function requireTool(userId: string, capability: Capability, label: string): Promise<McpToolInfo> {
  const catalog = await getToolCatalog(userId);
  const name = catalog.capabilities[capability];
  const tool = name ? catalog.tools.find((t) => t.name === name) : undefined;
  if (!tool) {
    throw new AppError('UNSUPPORTED', `The Enricho MCP server did not advertise a ${label} tool. Available: ${catalog.tools.map((t) => t.name).join(', ') || 'none'}.`, {
      provider: 'ENRICHO',
    });
  }
  return tool;
}

async function runTool(userId: string, tool: McpToolInfo, args: Record<string, unknown>) {
  const res = await withEnrichoMcp(userId, `tools/call:${tool.name}${args.preview ? ' (preview)' : ''}`, (client) => callTool(client, tool.name, args));
  if (res.isError) throw classifyToolErrorText(res.text);
  const parsed = parseToolPayload(res.structured, res.text);
  return { ...parsed, text: res.text };
}

// --- Connection management ------------------------------------------------------

function summarizeAccount(account: unknown, depth = 0): Record<string, unknown> | null {
  if (!account || typeof account !== 'object' || Array.isArray(account)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(account as Record<string, unknown>)) {
    if (/key|token|secret|password|url/i.test(k)) continue;
    if (['string', 'number', 'boolean'].includes(typeof v)) out[k] = v;
    else if (depth === 0 && v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(summarizeAccount(v, 1) || {})) out[`${k}.${k2}`] = v2;
    }
  }
  return out;
}

/** Validates an API key against the live server (tools/list + free account_usage) before saving. */
export async function connectWithApiKey(userId: string, apiKey: string) {
  const { tools, account } = await withEnrichoMcp(
    userId,
    'connect',
    async (client) => {
      const tools = await listTools(client);
      const accountTool = mapCapabilities(tools).account;
      if (!accountTool) return { tools, account: null as unknown };
      const res = await callTool(client, accountTool, {});
      if (res.isError) throw classifyToolErrorText(res.text);
      return { tools, account: parseToolPayload(res.structured, res.text).payload };
    },
    apiKey
  );
  await saveApiKey(userId, 'ENRICHO', apiKey, { status: 'CONNECTED', metadata: {} });
  const summary = summarizeAccount(account);
  const catalog = await storeCatalog(userId, tools, { account: summary, accountCheckedAt: new Date().toISOString() });
  return { catalog, account: summary, note: null as string | null };
}

/** Free credit balance check via account_usage. */
export async function accountStatus(userId: string) {
  const tool = await requireTool(userId, 'account', 'account usage');
  try {
    const { payload } = await runTool(userId, tool, {});
    const account = summarizeAccount(payload);
    await updateCredentialStatus(userId, 'ENRICHO', 'CONNECTED', null, { account, accountCheckedAt: new Date().toISOString() });
    return account;
  } catch (err) {
    if (err instanceof AppError && err.code === 'PROVIDER_AUTH') await updateCredentialStatus(userId, 'ENRICHO', 'ERROR', err.message);
    throw err;
  }
}

/** Starts MCP OAuth (dynamic client registration + PKCE). Returns the consent URL. */
export async function startOAuth(userId: string): Promise<string> {
  const provider = await EnrichoOAuthProvider.forStart(userId);
  try {
    const result = await auth(provider, { serverUrl: config.enricho.mcpUrl, scope: 'mcp' });
    if (result === 'REDIRECT' && provider.authorizationUrl) return provider.authorizationUrl.toString();
    throw new AppError('PROVIDER_ERROR', 'Enricho did not return an authorization URL.', { provider: 'ENRICHO' });
  } catch (err) {
    throw classifyMcpError(err);
  }
}

export async function finishOAuth(userId: string, code: string, state: string) {
  const provider = await EnrichoOAuthProvider.forCallback(userId, state);
  try {
    const result = await auth(provider, { serverUrl: config.enricho.mcpUrl, authorizationCode: code, scope: 'mcp' });
    if (result !== 'AUTHORIZED') throw new AppError('PROVIDER_AUTH', 'Enricho authorization did not complete.', { provider: 'ENRICHO' });
  } finally {
    await provider.consumeState();
  }
  const catalog = await refreshToolCatalog(userId);
  await accountStatus(userId).catch(() => undefined);
  return catalog;
}

// --- Data operations --------------------------------------------------------------

export interface PageResult<T> {
  toolName: string;
  records: T[];
  preview: boolean;
  totalItems: number | null;
  hasMore: boolean | null;
  nextPage: Record<string, unknown> | null;
  creditsUsed: number | null;
  applied: string[];
  notApplied: { filter: string; reason: string }[];
  rawText: string | null;
}

async function page<T>(
  userId: string,
  tool: McpToolInfo,
  built: BuiltArgs,
  normalize: (r: unknown) => T | null,
  preview: boolean
): Promise<PageResult<T>> {
  const { payload, parsed, text } = await runTool(userId, tool, built.args);
  if (!parsed) {
    logger.warn('Enricho returned unstructured text', { tool: tool.name, length: text.length });
    return { toolName: tool.name, records: [], preview, totalItems: null, hasMore: null, nextPage: null, creditsUsed: null, applied: built.applied, notApplied: built.notApplied, rawText: text.slice(0, 4000) };
  }
  const { records, totalItems, hasMore, nextPage, creditsUsed } = extractRecords(payload);
  return {
    toolName: tool.name,
    records: records.map(normalize).filter((x): x is T => Boolean(x)),
    preview,
    totalItems,
    hasMore,
    nextPage,
    creditsUsed,
    applied: built.applied,
    notApplied: built.notApplied,
    rawText: null,
  };
}

/** Company search. preview=true is free (≤3 results); full pages cost 5 credits per new record. */
export async function searchCompanies(userId: string, filters: CompanySearchFilters, nextPageArgs?: Record<string, unknown>) {
  const tool = await requireTool(userId, 'companySearch', 'company search');
  if (nextPageArgs) {
    // Enricho: pass next_page.arguments unchanged.
    return page(userId, tool, { args: nextPageArgs, applied: [], notApplied: [] }, normalizeCompany, false);
  }
  const built = buildCompanySearchArgs(tool, filters);
  if (!built.applied.length) {
    throw new AppError('VALIDATION', 'None of the filters are supported by Enricho company search. Add an industry, country, size or keywords.', {
      details: built.notApplied,
    });
  }
  return page(userId, tool, built, normalizeCompany, Boolean(filters.preview));
}

/** Refreshes one company by exact domain (full record: 5 credits if new). */
export async function enrichCompany(userId: string, domain: string) {
  const tool = await requireTool(userId, 'companySearch', 'company search');
  const built = buildCompanySearchArgs(tool, { domains: [domain], preview: false, limit: 1 });
  const res = await page(userId, tool, built, normalizeCompany, false);
  return { toolName: tool.name, company: res.records[0] ?? null };
}

export async function searchPeople(userId: string, filters: PeopleSearchFilters, nextPageArgs?: Record<string, unknown>) {
  const tool = await requireTool(userId, 'peopleSearch', 'person search');
  if (nextPageArgs) return page(userId, tool, { args: nextPageArgs, applied: [], notApplied: [] }, normalizePerson, false);
  const built = buildPeopleSearchArgs(tool, filters);
  return page(userId, tool, built, normalizePerson, Boolean(filters.preview));
}

/** Full record for one known person (contact details). 5 credits if new to your account. */
export async function enrichPerson(userId: string, personId: string): Promise<NormalizedPerson | null> {
  const res = await searchPeople(userId, { personIds: [personId], preview: false, limit: 1 });
  return res.records[0] ?? null;
}

export type { NormalizedCompany, NormalizedPerson };
