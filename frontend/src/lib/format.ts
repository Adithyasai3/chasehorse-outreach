export const STAGES = [
  { key: 'NEW_LEAD', label: 'New lead' },
  { key: 'RESEARCHING', label: 'Researching' },
  { key: 'QUALIFIED', label: 'Qualified' },
  { key: 'CONTACTED', label: 'Contacted' },
  { key: 'FOLLOW_UP', label: 'Follow-up' },
  { key: 'MEETING_SCHEDULED', label: 'Meeting scheduled' },
  { key: 'NEGOTIATION', label: 'Negotiation' },
  { key: 'WON', label: 'Won' },
  { key: 'LOST', label: 'Lost' },
] as const;
export type StageKey = (typeof STAGES)[number]['key'];
export const stageLabel = (k: string) => STAGES.find((s) => s.key === k)?.label || k;

export const QUAL_LABEL: Record<string, string> = {
  UNSCORED: 'Not scored',
  QUALIFIED: 'Qualified',
  NEEDS_REVIEW: 'Needs review',
  NOT_A_FIT: 'Not a fit',
};

export function fmtDate(d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', opts);
}

export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function relTime(d: string | Date | null | undefined) {
  if (!d) return '—';
  const diff = Date.now() - new Date(d).getTime();
  const abs = Math.abs(diff);
  const m = 60_000, h = 60 * m, day = 24 * h;
  const fmt = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  let s: string;
  if (abs < m) s = 'just now';
  else if (abs < h) s = fmt(Math.round(abs / m), 'min');
  else if (abs < day) s = fmt(Math.round(abs / h), 'hour');
  else if (abs < 30 * day) s = fmt(Math.round(abs / day), 'day');
  else return fmtDate(d);
  if (s === 'just now') return s;
  return diff >= 0 ? `${s} ago` : `in ${s}`;
}

export function fmtMoney(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${n}`;
}

// Fallback only: the discover page uses the enum from the live Enricho tool schema when it has one.
export const EMPLOYEE_BANDS = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10001+'];
export const ENRICHO_CREDITS_PER_RECORD = 5;
export const REVENUE_BANDS = [
  ['under-1m', 'Under $1M'],
  ['1m-10m', '$1M–10M'],
  ['10m-50m', '$10M–50M'],
  ['50m-100m', '$50M–100M'],
  ['100m-200m', '$100M–200M'],
  ['200m-1b', '$200M–1B'],
  ['over-1b', 'Over $1B'],
] as const;
export const CATEGORIES = [
  ['b2b', 'B2B'],
  ['b2c', 'B2C'],
  ['b2g', 'B2G'],
  ['e-commerce', 'E-commerce'],
  ['service-provider', 'Service provider'],
  ['saas', 'SaaS'],
  ['media', 'Media'],
  ['mobile', 'Mobile'],
] as const;
export const FUNDING_ROUNDS = [
  ['seed', 'Seed'],
  ['angel', 'Angel'],
  ['venture', 'Venture'],
  ['series_a', 'Series A'],
  ['series_b', 'Series B'],
  ['series_c', 'Series C'],
  ['series_d', 'Series D+'],
  ['debt_financing', 'Debt'],
] as const;
export const COMPANY_TYPES = [
  ['private', 'Private'],
  ['public', 'Public'],
  ['partnership', 'Partnership'],
  ['self-owned', 'Self-owned'],
] as const;
// Enricho person_search seniority values (docs.enricho.co/tools/person-search)
export const SENIORITY = [
  ['founder', 'Founder'],
  ['owner', 'Owner'],
  ['c_suite', 'C-suite'],
  ['vp', 'VP'],
  ['head', 'Head'],
  ['director', 'Director'],
  ['manager', 'Manager'],
  ['partner', 'Partner'],
] as const;
export const DEPARTMENTS = [
  ['c-suite', 'Executive'],
  ['operations', 'Operations'],
  ['finance', 'Finance'],
  ['sales', 'Sales'],
  ['marketing', 'Marketing'],
  ['information-technology', 'IT'],
] as const;
export const COUNTRIES = [
  ['IN', 'India'],
  ['AE', 'United Arab Emirates'],
  ['SG', 'Singapore'],
  ['SA', 'Saudi Arabia'],
  ['GB', 'United Kingdom'],
  ['US', 'United States'],
  ['DE', 'Germany'],
  ['NL', 'Netherlands'],
  ['AU', 'Australia'],
  ['ID', 'Indonesia'],
  ['MY', 'Malaysia'],
  ['TH', 'Thailand'],
  ['VN', 'Vietnam'],
  ['BD', 'Bangladesh'],
  ['LK', 'Sri Lanka'],
] as const;
export const TONES = ['professional', 'friendly', 'direct', 'consultative'] as const;
export const LENGTHS = ['short', 'medium', 'long'] as const;

export const campaignTone = (s: string) => (s === 'ACTIVE' ? 'good' : s === 'PAUSED' ? 'warn' : s === 'COMPLETED' ? 'info' : 'neutral') as 'good' | 'warn' | 'info' | 'neutral';
