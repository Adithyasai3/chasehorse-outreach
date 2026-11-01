const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

async function fetcher<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const json = await res.json();
      if (json.error) errorMsg = json.error;
    } catch {}
    throw new Error(errorMsg);
  }

  return res.json();
}

export const api = {
  // Discovery
  interpretQuery: (query: string) =>
    fetcher<{ filters: any }>('/discovery/interpret', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),

  estimateCredits: (params: { maxCompanies: number; enrichPeople: boolean; targetRolesCount: number }) =>
    fetcher<any>('/discovery/estimate', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  executeSearch: (payload: { query?: string; filters?: any; enrichContacts?: boolean; maxCompanies?: number }) =>
    fetcher<any>('/discovery/execute', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSearchHistory: () => fetcher<{ history: any[] }>('/discovery/history'),

  // Companies
  getCompanies: (params?: { search?: string; industry?: string; priority?: string; stageId?: string; sortBy?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.industry) searchParams.set('industry', params.industry);
    if (params?.priority) searchParams.set('priority', params.priority);
    if (params?.stageId) searchParams.set('stageId', params.stageId);
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
    return fetcher<{ companies: any[]; total: number }>(`/companies?${searchParams.toString()}`);
  },

  getCompanyById: (id: string) => fetcher<{ company: any }>(`/companies/${id}`),

  updateCompany: (id: string, data: any) =>
    fetcher<{ company: any }>(`/companies/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteCompany: (id: string) =>
    fetcher<any>(`/companies/${id}`, {
      method: 'DELETE',
    }),

  triggerResearch: (id: string) =>
    fetcher<any>(`/companies/${id}/research`, {
      method: 'POST',
    }),

  addCompanyNote: (id: string, content: string, author?: string) =>
    fetcher<any>(`/companies/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ content, author }),
    }),

  // Contacts
  getContacts: (params?: { search?: string; role?: string; seniority?: string; companyId?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.role) searchParams.set('role', params.role);
    if (params?.seniority) searchParams.set('seniority', params.seniority);
    if (params?.companyId) searchParams.set('companyId', params.companyId);
    return fetcher<{ contacts: any[]; total: number }>(`/contacts?${searchParams.toString()}`);
  },

  createContact: (data: any) =>
    fetcher<{ contact: any }>('/contacts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  enrichCompanyContacts: (companyId: string) =>
    fetcher<any>(`/contacts/enrich/${companyId}`, {
      method: 'POST',
    }),

  // Kanban Board
  getKanbanBoard: () => fetcher<{ stages: any[]; totalLeads: number }>('/kanban/board'),

  moveCompanyStage: (companyId: string, targetStageId: string) =>
    fetcher<any>('/kanban/move', {
      method: 'PATCH',
      body: JSON.stringify({ companyId, targetStageId }),
    }),

  // Services
  getServices: () => fetcher<{ services: any[] }>('/services'),

  createService: (data: any) =>
    fetcher<{ service: any }>('/services', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateService: (id: string, data: any) =>
    fetcher<{ service: any }>(`/services/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteService: (id: string) =>
    fetcher<any>(`/services/${id}`, {
      method: 'DELETE',
    }),

  matchAllServices: () =>
    fetcher<any>('/services/match-all', {
      method: 'POST',
    }),

  // Email & Outreach
  generateDraft: (params: {
    companyId: string;
    contactId?: string;
    serviceId?: string;
    outreachStyle?: string;
  }) =>
    fetcher<{ draft: any }>('/email/generate', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  getDrafts: (companyId?: string) => {
    const q = companyId ? `?companyId=${companyId}` : '';
    return fetcher<{ drafts: any[] }>(`/email/drafts${q}`);
  },

  updateDraft: (id: string, data: any) =>
    fetcher<{ draft: any }>(`/email/drafts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  sendEmail: (payload: {
    draftId?: string;
    companyId: string;
    contactId?: string;
    toEmail: string;
    subject: string;
    bodyText: string;
    bodyHtml?: string;
  }) =>
    fetcher<any>('/email/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getEmailThreads: () => fetcher<{ threads: any[] }>('/email/threads'),

  triggerEmailSync: () => fetcher<any>('/email/sync', { method: 'POST' }),

  simulateReply: (payload: {
    companyId: string;
    contactId?: string;
    incomingText?: string;
    subject?: string;
  }) =>
    fetcher<any>('/email/simulate-reply', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Gmail OAuth
  getGmailAuthUrl: () => fetcher<{ url: string }>('/gmail/oauth/url'),
  getGmailStatus: () => fetcher<{ isConnected: boolean; account: any }>('/gmail/status'),
  disconnectGmail: () => fetcher<any>('/gmail/disconnect', { method: 'POST' }),

  // Follow-ups
  getFollowUps: () => fetcher<any>('/followups'),
  createFollowUp: (data: any) => fetcher<any>('/followups', { method: 'POST', body: JSON.stringify(data) }),
  completeFollowUp: (id: string) => fetcher<any>(`/followups/${id}/complete`, { method: 'PATCH' }),
  generateFollowUpEmail: (id: string) => fetcher<any>(`/followups/${id}/generate-email`, { method: 'POST' }),

  // Analytics
  getAnalytics: () => fetcher<any>('/analytics/dashboard'),

  // Integrations & Health
  getIntegrationsStatus: () => fetcher<any>('/integrations/status'),
  testGemini: (apiKey?: string) => fetcher<any>('/integrations/test-gemini', { method: 'POST', body: JSON.stringify({ apiKey }) }),
  testEnricho: () => fetcher<any>('/integrations/test-enricho', { method: 'POST' }),

  // Settings & Suppression List
  getSuppressionList: () => fetcher<{ list: any[] }>('/settings/suppression'),
  addSuppression: (data: { email?: string; domain?: string; reason?: string }) =>
    fetcher<any>('/settings/suppression', { method: 'POST', body: JSON.stringify(data) }),
  removeSuppression: (id: string) => fetcher<any>(`/settings/suppression/${id}`, { method: 'DELETE' }),
};
