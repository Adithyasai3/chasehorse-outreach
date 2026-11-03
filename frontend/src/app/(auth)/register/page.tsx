import { Suspense } from 'react';
import { AuthForm } from '../auth-form';

export const metadata = { title: 'Create account' };

export default function RegisterPage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Create your account</h1>
      <p className="mb-6 text-[13px] text-ink-2">
        Each account keeps its own companies, contacts and API keys. After signing up you will connect Enricho, Gemini and Gmail with your own credentials.
      </p>
      <Suspense>
        <AuthForm mode="register" />
      </Suspense>
    </>
  );
}
