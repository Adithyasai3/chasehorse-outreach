'use client';

import { createContext, useContext } from 'react';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface IntegrationSummary {
  gemini: boolean;
  enricho: boolean;
  gmail: boolean;
  calendar: boolean;
}

export const SessionCtx = createContext<{ user: SessionUser; integrations: IntegrationSummary | null; refreshIntegrations: () => void; setUser: (u: SessionUser) => void } | null>(null);

export function useSession() {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error('useSession outside SessionCtx');
  return ctx;
}
