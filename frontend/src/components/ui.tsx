'use client';

import Link from 'next/link';
import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// --- Buttons --------------------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const btnBase =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded border text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const btnVariant: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink border-accent hover:bg-[#9c370c]',
  secondary: 'bg-surface text-ink border-line-strong hover:bg-sunken',
  ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-sunken hover:text-ink',
  danger: 'bg-surface text-bad border-line-strong hover:bg-bad-wash',
};
const btnSize = { sm: 'h-7 px-2.5', md: 'h-8 px-3', lg: 'h-10 px-4 text-sm' };

export function Button({
  variant = 'secondary',
  size = 'md',
  pending,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof btnSize; pending?: boolean }) {
  return (
    <button className={cx(btnBase, btnVariant[variant], btnSize[size], className)} disabled={pending || rest.disabled} {...rest}>
      {pending && <Spinner />}
      {children}
    </button>
  );
}

export function LinkButton({ href, variant = 'secondary', size = 'md', className, children }: { href: string; variant?: Variant; size?: keyof typeof btnSize; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cx(btnBase, btnVariant[variant], btnSize[size], className)}>
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx('inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-r-transparent', className)}
    />
  );
}

// --- Form fields ----------------------------------------------------------------------

const inputCls =
  'w-full rounded border border-line-strong bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-3 focus:border-ink-2 focus:outline-none disabled:bg-sunken';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cx(inputCls, 'h-8', className)} {...p} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cx(inputCls, 'py-2 leading-relaxed', className)} {...p} />;
});

export function Select({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputCls, 'h-8 pr-7', className)} {...p}>
      {children}
    </select>
  );
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: React.ReactNode; error?: string | null; children: React.ReactElement; className?: string }) {
  const id = useId();
  const child = React.cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error || hint ? `${id}-d` : undefined });
  return (
    <div className={cx('space-y-1', className)}>
      <label htmlFor={id} className="block text-[12px] font-medium text-ink-2">
        {label}
      </label>
      {child}
      {(error || hint) && (
        <p id={`${id}-d`} className={cx('text-2xs', error ? 'text-bad' : 'text-ink-3')}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

export function Checkbox({ label, checked, onChange, disabled }: { label: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex cursor-pointer select-none items-center gap-2 text-[13px]', disabled && 'opacity-50')}>
      <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--accent)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Multi-select rendered as toggle chips: fast for small fixed option sets. */
export function ChipSelect<T extends string>({ options, value, onChange }: { options: readonly (readonly [T, string])[] | readonly T[]; value: T[]; onChange: (v: T[]) => void }) {
  const opts = options.map((o) => (Array.isArray(o) ? o : [o, o])) as [T, string][];
  return (
    <div className="flex flex-wrap gap-1">
      {opts.map(([v, l]) => {
        const on = value.includes(v);
        return (
          <button
            type="button"
            key={v}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== v) : [...value, v])}
            className={cx(
              'h-7 rounded border px-2 text-[12px] transition-colors',
              on ? 'border-ink bg-ink text-paper' : 'border-line-strong bg-surface text-ink-2 hover:border-ink-3'
            )}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

/** Free-text list input: comma or Enter adds a value. */
export function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const parts = draft.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...value, ...parts])]);
    setDraft('');
  };
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1 rounded border border-line-strong bg-surface px-1.5 py-1 focus-within:border-ink-2">
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-sm bg-sunken px-1.5 py-0.5 text-[12px]">
          {v}
          <button type="button" className="text-ink-3 hover:text-ink" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}>
            ×
          </button>
        </span>
      ))}
      <input
        className="min-w-[8rem] flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-ink-3"
        value={draft}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={add}
      />
    </div>
  );
}

// --- Layout ---------------------------------------------------------------------------

export function PageHeader({ title, description, actions, crumbs }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; crumbs?: { href: string; label: string }[] }) {
  return (
    <header className="mb-6 flex flex-col gap-3 border-b border-line pb-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {crumbs && (
          <nav className="mb-1 flex gap-1 text-[12px] text-ink-3">
            {crumbs.map((c) => (
              <span key={c.href}>
                <Link href={c.href} className="hover:text-ink hover:underline">
                  {c.label}
                </Link>
                <span className="mx-1">/</span>
              </span>
            ))}
          </nav>
        )}
        <h1 className="truncate text-[22px] font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-[13px] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ title, actions, children, className, bodyClassName, id }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string; id?: string }) {
  return (
    <section id={id} className={cx('rounded border border-line bg-surface', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h2 className="text-[13px] font-semibold">{title}</h2>
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className={cx('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

export function KeyValue({ items }: { items: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-1.5 text-[13px]">
      {items.map(([k, v], i) => (
        <React.Fragment key={i}>
          <dt className="text-ink-3">{k}</dt>
          <dd className="min-w-0 break-words">{v ?? <span className="text-ink-3">Unknown</span>}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

// --- Status & provenance --------------------------------------------------------------

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'accent';
const toneCls: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-2',
  good: 'bg-good-wash text-good',
  warn: 'bg-warn-wash text-warn',
  bad: 'bg-bad-wash text-bad',
  info: 'bg-info-wash text-info',
  accent: 'bg-accent-wash text-accent',
};

export function Badge({ tone = 'neutral', children, className, title }: { tone?: Tone; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-[1px] text-[11px] font-medium', toneCls[tone], className)}>
      {children}
    </span>
  );
}

/** Where a piece of information came from. Used everywhere data is shown. */
export function Source({ kind, children }: { kind: 'enricho' | 'web' | 'ai' | 'user' | 'unknown' | 'gmail'; children?: React.ReactNode }) {
  const map = {
    enricho: { label: 'Enricho', cls: 'border-info/40 text-info', title: 'Returned by the Enricho data provider' },
    web: { label: 'Web, cited', cls: 'border-good/40 text-good', title: 'From Google Search grounding, with source links' },
    ai: { label: 'AI analysis', cls: 'border-warn/50 text-warn border-dashed', title: 'Generated by Gemini. Interpretation, not verified fact.' },
    user: { label: 'Entered by you', cls: 'border-line-strong text-ink-2', title: 'Entered manually' },
    unknown: { label: 'Unknown', cls: 'border-line-strong text-ink-3', title: 'Not available from any source' },
    gmail: { label: 'Gmail', cls: 'border-line-strong text-ink-2', title: 'Recorded from your Gmail account' },
  }[kind];
  return (
    <span title={map.title} className={cx('inline-flex items-center rounded-sm border px-1 py-[0px] font-mono text-[10px] uppercase tracking-wide', map.cls)}>
      {children || map.label}
    </span>
  );
}

export function StageBadge({ stage }: { stage: string }) {
  const tone: Tone = stage === 'WON' ? 'good' : stage === 'LOST' ? 'bad' : ['MEETING_SCHEDULED', 'NEGOTIATION'].includes(stage) ? 'accent' : 'neutral';
  const label = {
    NEW_LEAD: 'New lead', RESEARCHING: 'Researching', QUALIFIED: 'Qualified', CONTACTED: 'Contacted', FOLLOW_UP: 'Follow-up',
    MEETING_SCHEDULED: 'Meeting', NEGOTIATION: 'Negotiation', WON: 'Won', LOST: 'Lost',
  }[stage] || stage;
  return <Badge tone={tone}>{label}</Badge>;
}

export function ScoreChip({ score, status, manual }: { score: number | null | undefined; status?: string; manual?: boolean }) {
  if (score === null || score === undefined) return <span className="text-[12px] text-ink-3">Not scored</span>;
  const tone: Tone = status === 'QUALIFIED' ? 'good' : status === 'NOT_A_FIT' ? 'bad' : 'warn';
  return (
    <Badge tone={tone} title={manual ? 'Set manually' : 'AI-assisted score'}>
      <span className="num">{score}</span>
      {manual && <span aria-label="manual">·M</span>}
    </Badge>
  );
}

export function EmailStatus({ status, certainty }: { status: string; certainty?: string | null }) {
  if (status === 'PROVIDER_FOUND')
    return (
      <Badge tone="info" title="Returned by Enricho exactly as on file. Not independently verified; a listed email is not guaranteed to be deliverable.">
        From Enricho{certainty ? ` · ${certainty}` : ''}
      </Badge>
    );
  if (status === 'UNVERIFIED') return <Badge title="Entered or edited manually; not verified">Unverified</Badge>;
  return <span className="text-[12px] text-ink-3">No email</span>;
}

// --- Feedback states ------------------------------------------------------------------

export function Alert({ tone = 'info', title, children, action }: { tone?: 'info' | 'warn' | 'bad' | 'good'; title?: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const cls = { info: 'border-info/30 bg-info-wash', warn: 'border-warn/30 bg-warn-wash', bad: 'border-bad/30 bg-bad-wash', good: 'border-good/30 bg-good-wash' }[tone];
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={cx('flex flex-col gap-2 rounded border px-3 py-2.5 text-[13px] sm:flex-row sm:items-start sm:justify-between', cls)}>
      <div>
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-ink-2">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <Alert tone="bad" title="Could not load this" action={onRetry && <Button size="sm" onClick={onRetry}>Retry</Button>}>{message}</Alert>;
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-[13px] text-ink-2">{children}</div>}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton h-4', className)} />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-line rounded border border-line bg-surface" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 px-3 py-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={c === 0 ? 'w-1/4' : 'flex-1'} />
          ))}
        </div>
      ))}
    </div>
  );
}

// --- Tabs -----------------------------------------------------------------------------

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: React.ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cx(
            '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px]',
            value === t.key ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-2 hover:text-ink'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// --- Modal ----------------------------------------------------------------------------

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Focus once when opened (not on every render), preferring the first form field.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    const body = ref.current?.querySelector('[data-modal-body]');
    (body?.querySelector<HTMLElement>('input:not([disabled]),textarea,select') || ref.current?.querySelector<HTMLElement>('[data-modal-footer] button'))?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={cx('flex max-h-[92vh] w-full flex-col rounded-t border border-line bg-surface shadow-[0_12px_40px_rgba(28,31,35,0.18)] sm:rounded', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="px-1 text-xl leading-none text-ink-3 hover:text-ink" aria-label="Close">
            ×
          </button>
        </div>
        <div data-modal-body className="overflow-y-auto p-4">{children}</div>
        {footer && <div data-modal-footer className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// --- Toasts ---------------------------------------------------------------------------

type ToastMsg = { id: number; text: string; tone: 'good' | 'bad' | 'info' };
const ToastCtx = createContext<(text: string, tone?: ToastMsg['tone']) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastMsg[]>([]);
  const push = useCallback((text: string, tone: ToastMsg['tone'] = 'good') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === 'bad' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto rounded border px-3 py-2 text-[13px] shadow-[0_6px_20px_rgba(28,31,35,0.12)]',
              t.tone === 'bad' ? 'border-bad/40 bg-bad-wash text-bad' : t.tone === 'info' ? 'border-line bg-surface text-ink' : 'border-good/40 bg-good-wash text-good'
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// --- Confirm --------------------------------------------------------------------------

export function useConfirm() {
  const [state, setState] = useState<{ title: string; body: React.ReactNode; confirmLabel: string; danger?: boolean; resolve: (v: boolean) => void } | null>(null);
  const confirm = useCallback(
    (title: string, body: React.ReactNode, confirmLabel = 'Confirm', danger = false) =>
      new Promise<boolean>((resolve) => setState({ title, body, confirmLabel, danger, resolve })),
    []
  );
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const dialog = (
    <Modal
      open={Boolean(state)}
      onClose={() => close(false)}
      title={state?.title || ''}
      footer={
        <>
          <Button onClick={() => close(false)}>Cancel</Button>
          <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
            {state?.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[13px] text-ink-2">{state?.body}</div>
    </Modal>
  );
  return { confirm, dialog };
}
