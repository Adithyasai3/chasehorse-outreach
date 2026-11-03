/*
 * Normalizes Enricho tool payloads into internal records.
 * Field names follow https://docs.enricho.co/tools/company-search.md and person-search.md.
 * Enricho uses empty strings / null / empty arrays for "not on file"; those become null here.
 * Nothing is inferred.
 */

export interface NormalizedCompany {
  providerId: string | null;
  name: string;
  domain: string | null;
  website: string | null;
  logoUrl: string | null;
  industry: string | null;
  industries: string[];
  categories: string[];
  description: string | null;
  employeeRange: string | null;
  employeeCountMin: number | null;
  employeeCountMax: number | null;
  revenueRange: string | null;
  foundedYear: number | null;
  companyType: string | null;
  country: string | null;
  countryCode: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  totalFunding: number | null;
  fundingStage: string | null;
  fundingDate: string | null;
  fundingRounds: { date: string | null; amount: string | null; type: string | null; from: string | null; url: string | null }[];
  keywords: string[];
  technologies: string[];
  providerUpdatedAt: string | null;
}

export interface NormalizedPerson {
  providerId: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  seniority: string | null;
  department: string | null;
  linkedinUrl: string | null;
  location: string | null;
  imageUrl: string | null;
  email: string | null;
  emailType: string | null;
  phone: string | null;
  /** Preview flags: whether Enricho has these on file (values come only with full records). */
  hasEmail: boolean | null;
  hasPhone: boolean | null;
  currentCompany: { id: string | null; name: string | null; domain: string | null } | null;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);
const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const pick = (o: Obj, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return undefined;
};

export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = input.trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
  d = d.split('/')[0].split('?')[0].split('#')[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
}

export function normalizeCompany(raw: unknown): NormalizedCompany | null {
  if (!isObj(raw)) return null;
  const name = str(pick(raw, 'name', 'company_name'));
  const domain = normalizeDomain(str(pick(raw, 'domain')) || str(pick(raw, 'website')));
  if (!name && !domain) return null;
  const min = num(pick(raw, 'employee_count_min'));
  const max = num(pick(raw, 'employee_count_max'));
  return {
    providerId: str(pick(raw, 'company_id', 'id')),
    name: name || (domain as string),
    domain,
    website: str(raw.website),
    logoUrl: str(pick(raw, 'logo_url', 'logo')),
    industry: str(raw.industry),
    industries: [],
    categories: [],
    description: str(pick(raw, 'description')),
    employeeRange: str(pick(raw, 'employee_size_band', 'employees')),
    employeeCountMin: min,
    employeeCountMax: max,
    revenueRange: null,
    foundedYear: num(pick(raw, 'founded_year', 'founded')),
    companyType: null,
    country: str(raw.country),
    countryCode: str(pick(raw, 'country_code')),
    state: str(pick(raw, 'region', 'state')),
    city: str(raw.city),
    address: str(raw.address),
    phone: str(raw.phone),
    linkedinUrl: str(pick(raw, 'linkedin_url')),
    totalFunding: null,
    fundingStage: null,
    fundingDate: null,
    fundingRounds: [],
    keywords: [],
    technologies: [],
    providerUpdatedAt: str(pick(raw, 'updated_at')),
  };
}

export function normalizePerson(raw: unknown): NormalizedPerson | null {
  if (!isObj(raw)) return null;
  const id = str(pick(raw, 'person_id', 'id'));
  const first = str(pick(raw, 'first_name'));
  const last = str(pick(raw, 'last_name'));
  const fullName = str(pick(raw, 'full_name', 'name')) || [first, last].filter(Boolean).join(' ');
  if (!id || !fullName) return null;
  const company = isObj(raw.company) ? raw.company : null;
  const location = [str(raw.city), str(pick(raw, 'region')), str(raw.country)].filter(Boolean).join(', ') || null;
  return {
    providerId: id,
    fullName,
    firstName: first,
    lastName: last,
    title: str(pick(raw, 'job_title', 'title')),
    seniority: str(raw.seniority),
    department: str(pick(raw, 'role', 'department')),
    linkedinUrl: str(pick(raw, 'linkedin_url')),
    location,
    imageUrl: null,
    email: str(raw.email),
    emailType: str(pick(raw, 'email_type')),
    phone: str(raw.phone),
    hasEmail: typeof raw.has_email === 'boolean' ? raw.has_email : str(raw.email) ? true : null,
    hasPhone: typeof raw.has_phone === 'boolean' ? raw.has_phone : str(raw.phone) ? true : null,
    currentCompany: company
      ? { id: str(pick(company, 'company_id', 'id')), name: str(company.name), domain: normalizeDomain(str(company.domain) || str(company.website)) }
      : str(raw.company_name) || str(raw.company_domain)
        ? { id: str(raw.company_id), name: str(raw.company_name), domain: normalizeDomain(str(raw.company_domain)) }
        : null,
  };
}

export interface ExtractedPage {
  records: unknown[];
  totalItems: number | null;
  hasMore: boolean | null;
  nextPage: Record<string, unknown> | null; // next_page.arguments, passed back unchanged
  creditsUsed: number | null; // as reported by Enricho for this call
}

const LIST_KEYS = ['results', 'records', 'items', 'companies', 'people', 'persons', 'data'];

/**
 * Extracts records and paging from a tool payload.
 * Live Enricho responses are wrapped: { success: true, result: { results: [...], has_more,
 * next_page, credits_used, ... } } (observed from mcp.enricho.co on 2026-11-03).
 */
export function extractRecords(payload: unknown): ExtractedPage {
  const empty: ExtractedPage = { records: [], totalItems: null, hasMore: null, nextPage: null, creditsUsed: null };
  if (Array.isArray(payload)) return { ...empty, records: payload };
  if (!isObj(payload)) return empty;
  // Unwrap the { success, result } envelope.
  if (isObj(payload.result) && !('company_id' in payload) && !('person_id' in payload)) return extractRecords(payload.result);
  const nextRaw = payload.next_page ?? payload.nextPage;
  const nextPage = isObj(nextRaw) && isObj(nextRaw.arguments) ? (nextRaw.arguments as Record<string, unknown>) : null;
  const meta = {
    totalItems: num(pick(payload, 'total', 'total_count', 'totalItems', 'count')),
    hasMore: typeof payload.has_more === 'boolean' ? payload.has_more : nextPage ? true : null,
    nextPage,
    creditsUsed: num(payload.credits_used),
  };
  for (const key of LIST_KEYS) {
    const v = payload[key];
    if (Array.isArray(v)) return { ...meta, records: v };
    if (isObj(v)) {
      const inner = extractRecords(v);
      if (inner.records.length) return { ...inner, nextPage: inner.nextPage || nextPage, hasMore: inner.hasMore ?? meta.hasMore, totalItems: inner.totalItems ?? meta.totalItems };
    }
  }
  // Any array of objects
  for (const v of Object.values(payload)) {
    if (Array.isArray(v) && v.length && isObj(v[0])) return { ...meta, records: v };
  }
  // A single record
  if (pick(payload, 'company_id', 'person_id', 'name', 'domain', 'full_name') !== undefined) return { ...meta, records: [payload] };
  return { ...empty, ...meta };
}

/** Parses an MCP tool result: prefers structuredContent, then JSON in text content. */
export function parseToolPayload(structured: unknown, text: string): { payload: unknown; parsed: boolean } {
  if (structured !== null && structured !== undefined) return { payload: structured, parsed: true };
  const trimmed = text.trim();
  if (!trimmed) return { payload: null, parsed: false };
  try {
    return { payload: JSON.parse(trimmed), parsed: true };
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    const starts = ['{', '['].map((c) => trimmed.indexOf(c)).filter((i) => i >= 0);
    const candidate = fence ? fence[1] : starts.length ? trimmed.slice(Math.min(...starts)) : '';
    try {
      return { payload: JSON.parse(candidate), parsed: true };
    } catch {
      return { payload: null, parsed: false };
    }
  }
}
