'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useSession } from './session';
import { Alert, Button, Checkbox, Field, Input, Modal, Select, Textarea, useToast } from './ui';

function defaultDue() {
  const d = new Date(Date.now() + 3 * 24 * 3600 * 1000);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function FollowUpModal({
  open,
  onClose,
  leadId,
  contacts,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  leadId: string;
  contacts: { id: string; fullName: string }[];
  onCreated: () => void;
}) {
  const toast = useToast();
  const { integrations } = useSession();
  const [kind, setKind] = useState('FOLLOW_UP');
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState(defaultDue());
  const [duration, setDuration] = useState('30');
  const [contactId, setContactId] = useState('');
  const [notes, setNotes] = useState('');
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [moveStage, setMoveStage] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle('');
      setNotes('');
      setDueAt(defaultDue());
      setError(null);
      setAddToCalendar(false);
    }
  }, [open]);

  const submit = async () => {
    if (!title.trim()) return setError('Give the follow-up a short title.');
    const due = new Date(dueAt);
    if (Number.isNaN(due.getTime())) return setError('Pick a valid date and time.');
    setPending(true);
    setError(null);
    try {
      const res = await api.post<{ calendarError: string | null }>('/followups', {
        leadId,
        contactId: contactId || null,
        kind,
        title: title.trim(),
        notes: notes.trim() || null,
        dueAt: due.toISOString(),
        durationMinutes: Number(duration),
        addToCalendar,
        moveStage,
      });
      if (res.calendarError) toast(`Saved, but the calendar event failed: ${res.calendarError}`, 'bad');
      else toast(addToCalendar ? 'Scheduled and added to Google Calendar' : 'Follow-up scheduled');
      onCreated();
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
      title="Schedule a follow-up"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} pending={pending}>
            Schedule
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="bad">{error}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="FOLLOW_UP">Follow-up</option>
              <option value="CALL">Call</option>
              <option value="MEETING">Meeting</option>
            </Select>
          </Field>
          <Field label="With">
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">Anyone at the company</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Check whether they read the rate card" maxLength={200} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due">
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </Field>
          <Field label="Duration (calendar)">
            <Select value={duration} onChange={(e) => setDuration(e.target.value)}>
              {['15', '30', '45', '60'].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Notes">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </Field>
        <Checkbox
          checked={addToCalendar}
          onChange={setAddToCalendar}
          disabled={!integrations?.calendar}
          label={integrations?.calendar ? 'Add to my Google Calendar' : 'Add to Google Calendar (connect Calendar in Integrations first)'}
        />
        <Checkbox checked={moveStage} onChange={setMoveStage} label={`Move lead to "${kind === 'MEETING' ? 'Meeting scheduled' : 'Follow-up'}"`} />
      </div>
    </Modal>
  );
}
