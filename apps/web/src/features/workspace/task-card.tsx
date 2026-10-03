'use client';
import Link from 'next/link';
import { ArrowRight, Bot, FileCode2, GitBranch } from 'lucide-react';
import { Avatar, Status } from '@/components/ui';
import type { SampleTask } from '@/lib/sample-data';

export function TaskCard({ task }: { task: SampleTask }) {
  return <article className="task-card">
    <div className="task-person"><Avatar name={task.owner} /><div><strong>{task.owner} <span className="muted">+ Claude Code</span></strong><span><Bot size={12} aria-hidden="true" /> Sample session</span></div><Status state={task.state} /></div>
    <h3>{task.title}</h3><p className="task-scope">{task.scope}</p>
    <div className="branch"><GitBranch size={14} aria-hidden="true" /><code>{task.branch}</code></div>
    <div className="file-list">{task.files.map(file => <span key={file}><FileCode2 size={13} aria-hidden="true" /><code>{file}</code></span>)}</div>
    <div className="task-card-footer"><span className="muted">{task.state === 'needs_coordination' ? 'Scope review suggested' : task.state === 'proposed' ? 'Waiting for a new prompt' : 'Example activity · 10:35 AM'}</span><Link href={`/sessions/${task.sessionId}`}>View session <ArrowRight size={15} aria-hidden="true" /></Link></div>
  </article>;
}
