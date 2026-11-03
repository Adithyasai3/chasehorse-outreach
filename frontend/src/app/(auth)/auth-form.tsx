'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (mode === 'register' && !name.trim()) errs.name = 'Enter your name';
    if (!/^\S+@\S+\.\S+$/.test(email)) errs.email = 'Enter a valid email address';
    if (mode === 'register' && password.length < 10) errs.password = 'Use at least 10 characters';
    if (mode === 'login' && !password) errs.password = 'Enter your password';
    setFieldErr(errs);
    if (Object.keys(errs).length) return;
    setPending(true);
    setError(null);
    try {
      await api.post(`/auth/${mode}`, mode === 'register' ? { name, email, password } : { email, password });
      const next = params.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : mode === 'register' ? '/settings/integrations?welcome=1' : '/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {error && <Alert tone="bad">{error}</Alert>}
      {mode === 'register' && (
        <Field label="Your name" error={fieldErr.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
      )}
      <Field label="Work email" error={fieldErr.email}>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </Field>
      <Field label="Password" error={fieldErr.password} hint={mode === 'register' ? 'At least 10 characters.' : undefined}>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
      </Field>
      <Button type="submit" variant="primary" size="lg" className="w-full" pending={pending}>
        {mode === 'register' ? 'Create account' : 'Sign in'}
      </Button>
      <p className="text-center text-[13px] text-ink-2">
        {mode === 'register' ? (
          <>
            Already have an account? <Link className="text-ink underline" href="/login">Sign in</Link>
          </>
        ) : (
          <>
            New here? <Link className="text-ink underline" href="/register">Create an account</Link>
          </>
        )}
      </p>
      {mode === 'register' && (
        <p className="text-center text-2xs text-ink-3">
          By creating an account you agree to the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      )}
    </form>
  );
}
