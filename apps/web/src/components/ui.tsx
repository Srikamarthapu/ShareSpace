'use client';

import { useState } from 'react';
import { Check, Copy, Circle, LoaderCircle, CirclePause, GitPullRequestArrow, TriangleAlert } from 'lucide-react';
import { stateLabels, type SampleTask } from '@/lib/sample-data';

export function Status({ state }: { state: SampleTask['state'] }) {
  const Icon = state === 'active' ? LoaderCircle : state === 'needs_coordination' ? TriangleAlert : state === 'paused' ? CirclePause : state === 'awaiting_review' ? GitPullRequestArrow : Circle;
  return <span className={`status status-${state}`}><Icon size={13} aria-hidden="true" />{stateLabels[state]}</span>;
}
export function Avatar({ name, small = false }: { name: 'Sam' | 'Sri'; small?: boolean }) {
  return <span className={`avatar avatar-${name.toLowerCase()} ${small ? 'avatar-small' : ''}`} aria-hidden="true">{name === 'Sam' ? 'SA' : 'SK'}</span>;
}
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [feedback, setFeedback] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(value); setFeedback('Copied'); }
    catch { setFeedback('Copy unavailable — select the text to copy.'); }
  }
  return <span className="copy-control"><button type="button" className="button button-secondary" onClick={copy}>{feedback === 'Copied' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{label}</button><span className="copy-feedback" role="status">{feedback}</span></span>;
}
export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="empty-state"><Circle size={24} aria-hidden="true" /><h2>{title}</h2><p>{children}</p></div>;
}
