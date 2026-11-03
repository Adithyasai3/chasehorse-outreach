import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { config } from '../../config';
import { AppError } from '../../lib/errors';
import { getApiKey, getAuthType, logProviderCall } from '../../services/credentials.service';
import { EnrichoOAuthProvider } from './oauth.provider';

export interface McpToolInfo {
  name: string;
  title?: string;
  description?: string;
  inputSchema: JsonSchema;
}

export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  description?: string;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  $ref?: string;
  [k: string]: unknown;
}

export interface McpToolResult {
  isError: boolean;
  text: string;
  structured: unknown;
}

const CALL_TIMEOUT_MS = 60_000;

/** Classifies an MCP/transport failure into a typed AppError without leaking secrets. */
export function classifyMcpError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof UnauthorizedError) {
    return new AppError('PROVIDER_AUTH', 'Enricho rejected the credentials. Check your API key or reconnect.', { provider: 'ENRICHO' });
  }
  if (err instanceof StreamableHTTPError) {
    const code = err.code ?? 0;
    if (code === 401 || code === 403)
      return new AppError('PROVIDER_AUTH', 'Enricho rejected the credentials. Check your API key or reconnect.', { provider: 'ENRICHO' });
    if (code === 402) return new AppError('PROVIDER_CREDITS', 'Enricho reports insufficient credits.', { provider: 'ENRICHO' });
    if (code === 429) return new AppError('PROVIDER_RATE_LIMIT', 'Enricho rate limit reached. Wait a minute and retry.', { provider: 'ENRICHO' });
    return new AppError('PROVIDER_ERROR', `Enricho MCP server returned HTTP ${code || 'error'}.`, { provider: 'ENRICHO' });
  }
  const message = (err as Error)?.message || String(err);
  if (/timed? ?out|ETIMEDOUT|AbortError/i.test(message)) {
    return new AppError('PROVIDER_ERROR', 'Enricho did not respond in time.', { provider: 'ENRICHO' });
  }
  if (/ENOTFOUND|ECONNREFUSED|fetch failed|network/i.test(message)) {
    return new AppError('PROVIDER_ERROR', 'Could not reach the Enricho MCP server. Check your network connection.', { provider: 'ENRICHO' });
  }
  return new AppError('PROVIDER_ERROR', `Enricho MCP error: ${message.slice(0, 200)}`, { provider: 'ENRICHO' });
}

/** Maps an MCP tool-level error (isError=true) to a typed AppError using its message text. */
export function classifyToolErrorText(text: string): AppError {
  const t = text.toLowerCase();
  // Messages documented at https://docs.enricho.co/troubleshooting.md
  if (/\b401\b|\b403\b|unauthori[sz]ed|sign in to enricho|authentication failed|invalid (api )?key|invalid token|authorization token|check your api key/.test(t))
    return new AppError('PROVIDER_AUTH', 'Enricho rejected the credentials. Check your enr_ API key or sign in with Enricho again.', { provider: 'ENRICHO' });
  if (/\b402\b|payment required|insufficient credits|out of credits|enough credits/.test(t))
    return new AppError('PROVIDER_CREDITS', "Enricho: you don't have enough credits for this page. Nothing was charged. Request fewer results or add credits.", { provider: 'ENRICHO' });
  if (/\b429\b|rate limit|too many requests/.test(t))
    return new AppError('PROVIDER_RATE_LIMIT', 'Enricho rate limit or daily free-preview allowance reached (100 previews/day). Wait and retry, or run a paid full search.', { provider: 'ENRICHO' });
  if (/\b422\b|\b400\b|validation|invalid/.test(t))
    return new AppError('VALIDATION', `Enricho rejected the search parameters: ${text.slice(0, 300)}`, { provider: 'ENRICHO' });
  if (/\b404\b|not found/.test(t)) return new AppError('NOT_FOUND', 'Enricho has no record for that request.', { provider: 'ENRICHO' });
  return new AppError('PROVIDER_ERROR', `Enricho tool error: ${text.slice(0, 300)}`, { provider: 'ENRICHO' });
}

async function buildTransport(userId: string, apiKeyOverride?: string) {
  const authType = apiKeyOverride ? 'API_KEY' : await getAuthType(userId, 'ENRICHO');
  const url = new URL(config.enricho.mcpUrl);
  if (authType === 'API_KEY') {
    const apiKey = apiKeyOverride || (await getApiKey(userId, 'ENRICHO'));
    return new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
    });
  }
  if (authType === 'OAUTH') {
    const authProvider = await EnrichoOAuthProvider.forSession(userId);
    return new StreamableHTTPClientTransport(url, { authProvider });
  }
  throw new AppError('NOT_CONFIGURED', 'Enricho is not configured. Add an API key or connect with OAuth in Settings → Integrations.', {
    provider: 'ENRICHO',
  });
}

/** Opens an MCP session for the user, runs fn, and always closes the session. */
export async function withEnrichoMcp<T>(
  userId: string,
  operation: string,
  fn: (client: Client) => Promise<T>,
  apiKeyOverride?: string
): Promise<T> {
  const startedAt = Date.now();
  const transport = await buildTransport(userId, apiKeyOverride);
  const client = new Client({ name: 'chasehorse-outreach', version: '1.0.0' });
  try {
    await client.connect(transport);
    const result = await fn(client);
    await logProviderCall({ userId, provider: 'ENRICHO', operation, status: 'OK', startedAt });
    return result;
  } catch (err) {
    const appErr = classifyMcpError(err);
    await logProviderCall({ userId, provider: 'ENRICHO', operation, status: appErr.code, startedAt, detail: appErr.message });
    throw appErr;
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function listTools(client: Client): Promise<McpToolInfo[]> {
  const tools: McpToolInfo[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined, { timeout: CALL_TIMEOUT_MS });
    for (const t of page.tools) {
      tools.push({
        name: t.name,
        title: t.title,
        description: t.description,
        inputSchema: t.inputSchema as JsonSchema,
      });
    }
    cursor = page.nextCursor;
  } while (cursor);
  return tools;
}

export async function callTool(client: Client, name: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS });
  const content = (result.content as { type: string; text?: string }[] | undefined) || [];
  const text = content
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string)
    .join('\n');
  return {
    isError: Boolean(result.isError),
    text,
    structured: (result as { structuredContent?: unknown }).structuredContent ?? null,
  };
}
