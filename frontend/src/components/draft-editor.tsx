'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime, LENGTHS, TONES } from '@/lib/format';
import { useSession } from './session';
import { Alert, Badge, Button, Field, Input, Modal, Select, Source, Textarea, useConfirm, useToast } from './ui';

export interface Draft {
  id: string;
  companyId: string;
  contactId: string | null;
  campaignId: string | null;
  toEmail: string | null;
  subject: string;
  body: string;
  tone: string;
  length: string;
  objective: string | null;
  personalizationNotes: string | null;
  generatedByAi: boolean;
  model: string | null;
  status: 'DRAFT' | 'APPROVED' | 'SENT' | 'FAILED' | 'DISCARDED';
  approvedAt: string | null;
  sentAt: string | null;
  lastError: string | null;
  updatedAt: string;
  company?: { id: string; name: string; domain?: string | null };
  contact?: { id: string; fullName: string; email?: string | null; title?: string | null } | null;
}

export function DraftStatusBadge({ status }: { status: Draft['status'] }) {
  const map = { DRAFT: ['neutral', 'Draft'], APPROVED: ['info', 'Approved'], SENT: ['good', 'Sent'], FAILED: ['bad', 'Failed'], DISCARDED: ['neutral', 'Discarded'] } as const;
  const [tone, label] = map[status];
  return <Badge tone={tone}>{label}</Badge>;
}

/** Edit, approve and send one draft. Sending always requires approval plus a confirmation step. */
export function DraftEditor({ draft, onChange, onClose }: { draft: Draft; onChange: (d: Draft | null) => void; onClose?: () => void }) {
  const toast = useToast();
  const { integrations } = useSession();
  const { confirm, dialog } = useConfirm();
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [to, setTo] = useState(draft.toEmail || '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSubject(draft.subject);
    setBody(draft.body);
    setTo(draft.toEmail || '');
    setError(null);
  }, [draft.id, draft.subject, draft.body, draft.toEmail]);

  const dirty = subject !== draft.subject || body !== draft.body || to !== (draft.toEmail || '');
  const locked = draft.status === 'SENT';
  const emailOk = /^\S+@\S+\.\S+$/.test(to.trim());

  const run = async (key: string, fn: () => Promise<Draft | null>, msg?: string) => {
    setBusy(key);
    setError(null);
    try {
      const next = await fn();
      onChange(next);
      if (msg) toast(msg);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run('save', async () => (await api.patch<{ draft: Draft }>(`/emails/drafts/${draft.id}`, { subject, body, toEmail: to.trim() || null })).draft, 'Draft saved');

  const approve = async () => {
    if (!emailOk) return setError('Add a valid recipient email before approving.');
    await run('approve', async () => {
      if (dirty) await api.patch(`/emails/drafts/${draft.id}`, { subject, body, toEmail: to.trim() });
      return (await api.post<{ draft: Draft }>(`/emails/drafts/${draft.id}/approve`)).draft;
    }, 'Approved. It will not be sent until you click Send.');
  };

  const send = async () => {
    if (!integrations?.gmail) return setError('Connect Gmail in Settings → Integrations before sending.');
    const ok = await confirm(
      'Send this email now?',
      <>
        <p>
          It will be sent from your connected Gmail account to <strong className="text-ink">{draft.toEmail}</strong> with the subject
          <strong className="text-ink"> “{draft.subject}”</strong>.
        </p>
        <p className="mt-2">This cannot be undone.</p>
      </>,
      'Send email'
    );
    if (!ok) return;
    await run('send', async () => (await api.post<{ draft: Draft }>(`/emails/drafts/${draft.id}/send`, { confirm: true })).draft, 'Email sent');
  };

  const discard = async () => {
    if (!(await confirm('Discard this draft?', 'It will be removed from your drafts.', 'Discard', true))) return;
    await run('discard', async () => {
      await api.post(`/emails/drafts/${draft.id}/discard`);
      return null;
    }, 'Draft discarded');
    onClose?.();
  };

  const regenerate = async () => {
    await run('regen', async () => {
      const fresh = await api.post<{ draft: Draft }>('/emails/drafts/generate', {
        companyId: draft.companyId,
        contactId: draft.contactId,
        campaignId: draft.campaignId,
        objective: draft.objective || 'Introduce our services and ask for a short call',
        tone: draft.tone,
        length: draft.length,
      });
      await api.post(`/emails/drafts/${draft.id}/discard`);
      return fresh.draft;
    }, 'New draft generated');
  };

  const copy = async () => {
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    toast('Copied to clipboard', 'info');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-2">
        <DraftStatusBadge status={draft.status} />
        {draft.generatedByAi && <Source kind="ai">AI draft · {draft.model}</Source>}
        <span>
          {draft.tone} · {draft.length}
        </span>
        {draft.sentAt && <span>Sent {fmtDateTime(draft.sentAt)}</span>}
        {draft.status === 'APPROVED' && draft.approvedAt && <span>Approved {fmtDateTime(draft.approvedAt)}</span>}
      </div>
      {draft.status === 'FAILED' && draft.lastError && <Alert tone="bad" title="Last send attempt failed">{draft.lastError}</Alert>}
      {error && <Alert tone="bad">{error}</Alert>}
      <Field label="To" hint={draft.contact ? `${draft.contact.fullName}${draft.contact.title ? `, ${draft.contact.title}` : ''}` : 'No contact linked'}>
        <Input value={to} onChange={(e) => setTo(e.target.value)} disabled={locked} type="email" placeholder="name@company.com" />
      </Field>
      <Field label="Subject">
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={locked} maxLength={200} />
      </Field>
      <Field label="Message">
        <Textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} disabled={locked} className="font-sans" />
      </Field>
      {draft.personalizationNotes && (
        <div className="rounded border border-dashed border-warn/50 bg-warn-wash/40 px-3 py-2 text-[12px] text-ink-2">
          <span className="font-medium text-warn">What the AI used: </span>
          {draft.personalizationNotes}
        </div>
      )}
      {draft.status === 'APPROVED' && dirty && <Alert tone="warn">Saving changes will return this email to draft. You will need to approve it again.</Alert>}
      {!locked && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {draft.status === 'APPROVED' ? (
            <Button variant="primary" onClick={send} pending={busy === 'send'} disabled={dirty}>
              Send via Gmail
            </Button>
          ) : (
            <Button variant="primary" onClick={approve} pending={busy === 'approve'}>
              {dirty ? 'Save and approve' : 'Approve'}
            </Button>
          )}
          <Button onClick={save} pending={busy === 'save'} disabled={!dirty}>
            Save changes
          </Button>
          {draft.generatedByAi && (
            <Button onClick={regenerate} pending={busy === 'regen'}>
              Regenerate
            </Button>
          )}
          <Button variant="ghost" onClick={copy}>
            Copy
          </Button>
          <Button variant="ghost" className="ml-auto text-bad" onClick={discard} pending={busy === 'discard'}>
            Discard
          </Button>
        </div>
      )}
      {dialog}
    </div>
  );
}

/** Form to generate a new AI draft for a company. */
export function GenerateDraftModal({
  open,
  onClose,
  companyId,
  contacts,
  defaultContactId,
  campaignId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  contacts: { id: string; fullName: string; email: string | null; title: string | null }[];
  defaultContactId?: string | null;
  campaignId?: string | null;
  onCreated: (d: Draft) => void;
}) {
  const { integrations } = useSession();
  const [contactId, setContactId] = useState(defaultContactId || contacts[0]?.id || '');
  const [objective, setObjective] = useState('Introduce ChaseHorse and ask for a 15-minute call about their distribution');
  const [tone, setTone] = useState<string>('professional');
  const [length, setLength] = useState<string>('short');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setContactId(defaultContactId || contacts[0]?.id || '');
      setError(null);
      api.get<{ settings: { defaultTone: string; defaultLength: string } }>('/settings').then((s) => {
        setTone(s.settings.defaultTone);
        setLength(s.settings.defaultLength);
      }).catch(() => undefined);
    }
  }, [open, defaultContactId, contacts]);

  const submit = async () => {
    if (objective.trim().length < 5) return setError('Describe what the email should achieve.');
    setPending(true);
    setError(null);
    try {
      const { draft } = await api.post<{ draft: Draft }>('/emails/drafts/generate', { companyId, contactId: contactId || null, campaignId: campaignId || null, objective: objective.trim(), tone, length });
      onCreated(draft);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Draft an email with Gemini"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} pending={pending} disabled={integrations ? !integrations.gemini : false}>
            Generate draft
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {integrations && !integrations.gemini && <Alert tone="warn">Connect Gemini in Settings → Integrations to generate drafts.</Alert>}
        {error && <Alert tone="bad">{error}</Alert>}
        <Field label="Recipient" hint={contacts.length ? 'Contacts without an email can still be drafted; add the address before approving.' : 'No contacts saved yet. The draft will address the team generically.'}>
          <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">No specific person</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
                {c.title ? `, ${c.title}` : ''}
                {c.email ? '' : ' (no email)'}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Objective" hint="The AI uses your latest research on this company and your business settings.">
          <Textarea rows={3} value={objective} onChange={(e) => setObjective(e.target.value)} maxLength={600} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tone">
            <Select value={tone} onChange={(e) => setTone(e.target.value)}>
              {TONES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Length">
            <Select value={length} onChange={(e) => setLength(e.target.value)}>
              {LENGTHS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="text-[12px] text-ink-3">Generating never sends anything. You will review, approve and send separately.</p>
      </div>
    </Modal>
  );
}
