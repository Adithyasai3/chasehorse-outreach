import { Suspense } from 'react';
import { AuthForm } from '../auth-form';

export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Sign in</h1>
      <p className="mb-6 text-[13px] text-ink-2">Use the account you created for ChaseHorse Outreach.</p>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </>
  );
}
