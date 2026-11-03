'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Badge, Button, Checkbox, ErrorState, Field, Input, LinkButton, Modal, PageHeader, Panel, Select, Skeleton, TagInput, Textarea, useConfirm, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtDate, LENGTHS, TONES } from '@/lib/format';
import { useApi } from '@/lib/hooks';

interface Settings {
  businessName: string;
  businessDescription: string;
  valueProposition: string;
  idealCustomerProfile: string;
  senderName: string;
  senderTitle: string;
  signature: string;
  geminiModel: string;
  useSearchGrounding: boolean;
  defaultTone: string;
  defaultLength: string;
}
interface Service { id: string; name: string; description: string; valueProposition: string; targetIndustries: string[]; isActive: boolean }

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Your profile, the business context the AI writes from, and who should never be contacted." actions={<LinkButton href="/settings/integrations">Integrations</LinkButton>} />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Profile />
          <Business />
        </div>
        <div className="space-y-6">
          <Services />
          <Suppression />
          <Password />
        </div>
      </div>
    </>
  );
}

function Profile() {
  const { user, setUser } = useSession();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [pending, setPending] = useState(false);
  return (
    <Panel title="Profile">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setPending(true);
          try {
            const r = await api.patch<{ user: typeof user }>('/auth/profile', { name: name.trim() });
            setUser(r.user);
            toast('Profile saved');
          } catch (err) {
            toast(errorMessage(err), 'bad');
          } finally {
            setPending(false);
          }
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></Field>
          <Field label="Email" hint="Used to sign in."><Input value={user.email} disabled /></Field>
        </div>
        <Button type="submit" pending={pending} disabled={!name.trim() || name === user.name}>Save</Button>
      </form>
    </Panel>
  );
}

function Business() {
  const toast = useToast();
  const { data, error, reload } = useApi<{ settings: Settings }>('/settings');
  const [s, setS] = useState<Settings | null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (data) setS(data.settings);
  }, [data]);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!s) return <Skeleton className="h-96" />;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  const save = async () => {
    if (!s.businessName.trim()) return setErr('Business name is required.');
    if (!/^[a-z0-9.\-]+$/i.test(s.geminiModel)) return setErr('Model id can only contain letters, numbers, dots and dashes.');
    setPending(true);
    setErr(null);
    try {
      await api.patch('/settings', s);
      toast('Settings saved');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <Panel title="Business context and AI">
      <div className="space-y-3">
        <Alert tone="info">Gemini only knows what you write here about your company. Include real capabilities and figures you can stand behind; the AI is told not to invent any.</Alert>
        {err && <Alert tone="bad">{err}</Alert>}
        <Field label="Business name"><Input value={s.businessName} onChange={(e) => set('businessName', e.target.value)} /></Field>
        <Field label="What you do"><Textarea rows={3} value={s.businessDescription} onChange={(e) => set('businessDescription', e.target.value)} maxLength={2000} /></Field>
        <Field label="Value proposition" hint="Verified outcomes, coverage, certifications, notable customers you may name."><Textarea rows={3} value={s.valueProposition} onChange={(e) => set('valueProposition', e.target.value)} maxLength={2000} /></Field>
        <Field label="Ideal customer profile"><Textarea rows={2} value={s.idealCustomerProfile} onChange={(e) => set('idealCustomerProfile', e.target.value)} maxLength={2000} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sender name"><Input value={s.senderName} onChange={(e) => set('senderName', e.target.value)} /></Field>
          <Field label="Sender title"><Input value={s.senderTitle} onChange={(e) => set('senderTitle', e.target.value)} /></Field>
        </div>
        <Field label="Email signature" hint="Appended to every generated draft."><Textarea rows={3} value={s.signature} onChange={(e) => set('signature', e.target.value)} maxLength={1000} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Gemini model"><Input value={s.geminiModel} onChange={(e) => set('geminiModel', e.target.value.trim())} /></Field>
          <Field label="Default tone"><Select value={s.defaultTone} onChange={(e) => set('defaultTone', e.target.value)}>{TONES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="Default length"><Select value={s.defaultLength} onChange={(e) => set('defaultLength', e.target.value)}>{LENGTHS.map((t) => <option key={t}>{t}</option>)}</Select></Field>
        </div>
        <Checkbox checked={s.useSearchGrounding} onChange={(v) => set('useSearchGrounding', v)} label="Use Google Search grounding during research (adds cited web findings; uses more Gemini quota)" />
        <Button variant="primary" pending={pending} onClick={save}>Save settings</Button>
      </div>
    </Panel>
  );
}

function Services() {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data, error, reload } = useApi<{ services: Service[] }>('/services');
  const [edit, setEdit] = useState<Partial<Service> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const save = async () => {
    if (!edit?.name?.trim() || !edit.description?.trim()) return setErr('Name and description are required.');
    setPending(true);
    try {
      const body = { name: edit.name, description: edit.description, valueProposition: edit.valueProposition || '', targetIndustries: edit.targetIndustries || [], isActive: edit.isActive ?? true };
      if (edit.id) await api.patch(`/services/${edit.id}`, body);
      else await api.post('/services', body);
      toast('Service saved');
      setEdit(null);
      reload();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <Panel title="Services you sell" actions={<Button size="sm" onClick={() => { setErr(null); setEdit({ isActive: true, targetIndustries: [] }); }}>Add service</Button>}>
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <Skeleton className="h-32" /> : !data.services.length ? (
        <p className="text-[13px] text-ink-3">Add the services you offer so research and emails can match them to each prospect.</p>
      ) : (
        <ul className="divide-y divide-line">
          {data.services.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-3 py-2 text-[13px]">
              <div className="min-w-0">
                <p className="font-medium">{s.name} {!s.isActive && <Badge>inactive</Badge>}</p>
                <p className="text-[12px] text-ink-2">{s.description}</p>
                {s.targetIndustries.length > 0 && <p className="text-[11px] text-ink-3">{s.targetIndustries.join(', ')}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" onClick={() => { setErr(null); setEdit(s); }}>Edit</Button>
                <Button size="sm" variant="ghost" className="text-bad" onClick={async () => { if (await confirm(`Delete ${s.name}?`, 'Campaigns using it will fall back to "any service".', 'Delete', true)) { await api.del(`/services/${s.id}`); reload(); } }}>Delete</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id ? 'Edit service' : 'Add service'} footer={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" pending={pending} onClick={save}>Save</Button></>}>
        {edit && (
          <div className="space-y-3">
            {err && <Alert tone="bad">{err}</Alert>}
            <Field label="Name"><Input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Description"><Textarea rows={3} value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Value proposition" hint="Only claims you can back up."><Textarea rows={2} value={edit.valueProposition || ''} onChange={(e) => setEdit({ ...edit, valueProposition: e.target.value })} /></Field>
            <Field label="Target industries"><TagInput value={edit.targetIndustries || []} onChange={(v) => setEdit({ ...edit, targetIndustries: v })} /></Field>
            <Checkbox checked={edit.isActive ?? true} onChange={(v) => setEdit({ ...edit, isActive: v })} label="Active" />
          </div>
        )}
      </Modal>
      {dialog}
    </Panel>
  );
}

function Suppression() {
  const toast = useToast();
  const { data, reload } = useApi<{ entries: { id: string; email: string | null; domain: string | null; reason: string; createdAt: string }[] }>('/suppression');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const add = async () => {
    const v = value.trim().toLowerCase();
    const isEmail = v.includes('@');
    if (isEmail ? !/^\S+@\S+\.\S+$/.test(v) : !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) return setErr('Enter an email address or a domain like example.com');
    try {
      await api.post('/suppression', { ...(isEmail ? { email: v } : { domain: v }), reason: reason.trim() || 'Do not contact' });
      setValue('');
      setReason('');
      setErr(null);
      toast('Added to do-not-contact list');
      reload();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  return (
    <Panel title="Do not contact">
      <p className="mb-3 text-[13px] text-ink-2">Sending to these addresses or domains is blocked, even for approved drafts.</p>
      <div className="flex flex-wrap gap-2">
        <Input className="min-w-[12rem] flex-1" value={value} onChange={(e) => setValue(e.target.value)} placeholder="email or domain" aria-label="Email or domain" />
        <Input className="min-w-[10rem] flex-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" aria-label="Reason" />
        <Button onClick={add}>Add</Button>
      </div>
      {err && <p className="mt-1 text-[12px] text-bad">{err}</p>}
      <ul className="mt-3 divide-y divide-line text-[13px]">
        {data?.entries.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-2 py-1.5">
            <span><span className="num">{e.email || e.domain}</span> <span className="text-[12px] text-ink-3">{e.reason} · {fmtDate(e.createdAt)}</span></span>
            <Button size="sm" variant="ghost" onClick={async () => { await api.del(`/suppression/${e.id}`); reload(); }}>Remove</Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Password() {
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <Panel title="Password">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (next.length < 10) return setErr('New password must be at least 10 characters.');
          setPending(true);
          try {
            await api.post('/auth/password', { currentPassword: cur, newPassword: next });
            setCur('');
            setNext('');
            setErr(null);
            toast('Password changed');
          } catch (e2) {
            setErr(errorMessage(e2));
          } finally {
            setPending(false);
          }
        }}
      >
        {err && <Alert tone="bad">{err}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Current password"><Input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
          <Field label="New password"><Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        </div>
        <Button type="submit" pending={pending} disabled={!cur || !next}>Change password</Button>
      </form>
    </Panel>
  );
}
