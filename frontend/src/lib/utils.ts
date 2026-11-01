import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatScore(score: number): { label: string; color: string; bg: string } {
  if (score >= 80) return { label: 'High Priority', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' };
  if (score >= 60) return { label: 'Medium Priority', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' };
  return { label: 'Low Priority', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' };
}

export function formatDate(dateStr?: string | Date | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
