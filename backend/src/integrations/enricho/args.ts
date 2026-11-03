import type { JsonSchema, McpToolInfo } from './mcp.client';

/*
 * Builds tool arguments from the tool's *discovered* input schema.
 * Canonical filter names follow Enricho's documented tool parameters
 * (https://docs.enricho.co/tools/company-search.md, person-search.md). Only parameters the
 * live tool declares are sent; enum values it rejects are dropped and reported.
 */

export interface CompanySearchFilters {
  query?: string; // plain words: each must appear in name, domain, website, industry, country or address
  industries?: string[];
  keywords?: string[]; // folded into query (AND semantics)
  countries?: string[]; // ISO-3166 alpha-2
  cityNames?: string[]; // folded into query (matches the address)
  employees?: string[]; // size bands as the provider names them
  names?: string[];
  domains?: string[];
  preview?: boolean;
  limit?: number;
  cursor?: string;
}

export interface PeopleSearchFilters {
  companyDomains?: string[];
  companyIds?: string[];
  jobTitles?: string[];
  seniority?: string[];
  roles?: string[];
  countries?: string[];
  hasEmail?: boolean;
  personIds?: string[];
  preview?: boolean;
  limit?: number;
  cursor?: string;
}

export interface BuiltArgs {
  args: Record<string, unknown>;
  applied: string[];
  notApplied: { filter: string; reason: string }[];
}

function unwrap(schema: JsonSchema | undefined): JsonSchema | undefined {
  if (!schema) return schema;
  const variants = schema.anyOf || schema.oneOf;
  if (variants) return variants.find((s) => s.type !== 'null') || schema;
  return schema;
}

/** Some MCP servers wrap the body in a single object parameter. Detect that and descend. */
export function resolveParamContainer(tool: McpToolInfo): { props: Record<string, JsonSchema>; wrapKey: string | null } {
  const top = tool.inputSchema?.properties || {};
  const keys = Object.keys(top);
  if (keys.length === 1) {
    const only = unwrap(top[keys[0]]);
    if (only?.properties && Object.keys(only.properties).length > 1) return { props: only.properties, wrapKey: keys[0] };
  }
  return { props: top, wrapKey: null };
}

/** Allowed enum values for a parameter, looking through anyOf/oneOf and array items. */
export function allowedEnum(schema: JsonSchema | undefined): unknown[] | null {
  if (!schema) return null;
  const candidates = [schema, ...(schema.anyOf || []), ...(schema.oneOf || [])];
  for (const s of candidates) {
    if (Array.isArray(s.enum)) return s.enum;
    if (s.items && Array.isArray(s.items.enum)) return s.items.enum;
  }
  return null;
}

function wantsArray(schema: JsonSchema): boolean {
  const variants = schema.anyOf || schema.oneOf;
  if (variants) return variants.some((s) => s.type === 'array' || (Array.isArray(s.type) && s.type.includes('array')));
  return schema.type === 'array' || (Array.isArray(schema.type) && schema.type.includes('array'));
}

/**
 * Keeps only keys the tool declares, drops enum values it doesn't accept,
 * and coerces arrays/strings to the shape the schema wants.
 */
export function filterArgsBySchema(tool: McpToolInfo, canonical: Record<string, unknown>, labels: Record<string, string> = {}): BuiltArgs {
  const { props, wrapKey } = resolveParamContainer(tool);
  const args: Record<string, unknown> = {};
  const applied: string[] = [];
  const notApplied: { filter: string; reason: string }[] = [];
  for (const [key, raw] of Object.entries(canonical)) {
    if (raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0)) continue;
    const label = labels[key] || key;
    if (!Object.prototype.hasOwnProperty.call(props, key)) {
      notApplied.push({ filter: label, reason: `the ${tool.name} tool has no "${key}" parameter` });
      continue;
    }
    let value = raw;
    const allowed = allowedEnum(props[key]);
    if (allowed && Array.isArray(value)) {
      const kept = value.filter((v) => allowed.includes(v));
      const dropped = value.filter((v) => !allowed.includes(v));
      if (dropped.length) notApplied.push({ filter: label, reason: `values not accepted: ${dropped.join(', ')}` });
      if (!kept.length) continue;
      value = kept;
    }
    const arr = wantsArray(props[key]);
    if (Array.isArray(value) && !arr) value = value.length === 1 ? value[0] : value.join(' ');
    args[key] = value;
    if (!['preview', 'limit', 'cursor'].includes(key)) applied.push(label);
  }
  return { args: wrapKey ? { [wrapKey]: args } : args, applied: [...new Set(applied)], notApplied };
}

export function buildCompanySearchArgs(tool: McpToolInfo, f: CompanySearchFilters): BuiltArgs {
  // Enricho's company_search has no keyword or city field; `query` words must each appear in
  // the name, domain, website, industry, country or address, so they are added there.
  const queryWords = [f.query, ...(f.keywords || []), ...(f.cityNames || [])].map((s) => s?.trim()).filter(Boolean);
  return filterArgsBySchema(
    tool,
    {
      industry: f.industries,
      employee_size_band: f.employees,
      country_code: f.countries?.map((c) => c.toUpperCase()),
      name: f.names,
      domain: f.domains,
      query: queryWords.length ? queryWords.join(' ') : undefined,
      preview: f.cursor ? undefined : f.preview,
      limit: f.preview ? undefined : f.limit,
      cursor: f.cursor,
    },
    { industry: 'Industry', employee_size_band: 'Company size', country_code: 'Country', name: 'Name', domain: 'Domain', query: 'Keywords / city / text' }
  );
}

export function buildPeopleSearchArgs(tool: McpToolInfo, f: PeopleSearchFilters): BuiltArgs {
  return filterArgsBySchema(
    tool,
    {
      company_domain: f.companyDomains,
      company_id: f.companyIds,
      job_title: f.jobTitles,
      seniority: f.seniority,
      role: f.roles,
      country_code: f.countries?.map((c) => c.toUpperCase()),
      has_email: f.hasEmail || undefined,
      person_id: f.personIds,
      preview: f.cursor ? undefined : f.preview,
      limit: f.preview ? undefined : f.limit,
      cursor: f.cursor,
    },
    { company_domain: 'Company', job_title: 'Job title', seniority: 'Seniority', role: 'Role', country_code: 'Country', has_email: 'Has email', person_id: 'Person' }
  );
}
