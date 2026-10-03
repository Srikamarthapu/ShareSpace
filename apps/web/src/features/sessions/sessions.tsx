'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Bot, FileCode2, GitBranch, Search } from 'lucide-react';
import { useWorkspace } from '@/components/workspace-provider';
import { Avatar, CopyButton, EmptyState, Status } from '@/components/ui';
import { sampleEvents } from '@/lib/sample-data';

export function Sessions() {
  const { state } = useWorkspace();
  const [query, setQuery] = useState('');
  const tasks = state.tasks.filter(task => `${task.title} ${task.owner} ${task.branch}`.toLowerCase().includes(query.toLowerCase()));
  return <><div className="page-heading"><div className="heading-copy"><div className="eyebrow">SHARED, WITH INTENT</div><h1>Sessions</h1><p>A window into the work. Only the conversations you choose to share.</p></div></div><div className="toolbar"><label className="search-field"><Search size={16} aria-hidden="true" /><span className="sr-only">Search sessions</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by builder, task, or branch…" /></label><span className="muted small">{tasks.length} sample sessions</span></div><div className="session-list">{tasks.map(task => <Link className="session-row" key={task.id} href={`/sessions/${task.sessionId}`}><Avatar name={task.owner} /><div><h2>{task.title}</h2><p>{task.owner} + Claude Code <span>· {task.branch}</span></p></div><Status state={task.state} /><ArrowRight size={17} aria-hidden="true" /></Link>)}</div>{!tasks.length && <EmptyState title="No matching sessions">Try another builder, branch, or task name.</EmptyState>}<p className="understated-note">All sessions here are sample history. Real capture and cross-client streaming are the next integration gate.</p></>;
}

export function SessionDetail({ id }: { id: string }) {
  const { state } = useWorkspace();
  const task = state.tasks.find(task => task.sessionId === id);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  if (!task) return <EmptyState title="Session not available">This sample session may have been reset. <Link href="/sessions">Return to sessions.</Link></EmptyState>;
  const events = sampleEvents.filter(event => event.sessionId === id && (kind === 'all' || event.role === kind) && `${event.title} ${event.content}`.toLowerCase().includes(query.toLowerCase()));
  return <><Link href="/sessions" className="back-link"><ArrowLeft size={15} aria-hidden="true" />All sessions</Link><div className="page-heading"><div><div className="eyebrow">SAMPLE SESSION</div><h1>{task.title}</h1><p>{task.owner} + Claude Code <span className="inline-branch"><GitBranch size={13} aria-hidden="true" />{task.branch}</span></p></div><Status state={task.state} /></div>
    <div className="detail-grid"><section aria-label="Session transcript"><div className="toolbar"><label className="search-field"><Search size={16} aria-hidden="true" /><span className="sr-only">Search transcript</span><input type="search" placeholder="Find in this session…" value={query} onChange={event => setQuery(event.target.value)} /></label><label className="sr-only" htmlFor="event-filter">Event type</label><select id="event-filter" value={kind} onChange={e => setKind(e.target.value)}><option value="all">All events</option><option value="user">User prompts</option><option value="assistant">Agent responses</option><option value="tool">Tool events</option></select></div><p className="muted small" role="status">{events.length} matching events · Synthetic history from Oct 3, 2026</p><div className="transcript">{events.map(event => <article className={`transcript-event event-${event.role}`} id={event.id} key={event.id}><div className="event-heading">{event.role === 'assistant' ? <Bot size={18} aria-hidden="true" /> : event.role === 'tool' ? <FileCode2 size={18} aria-hidden="true" /> : <Avatar name={task.owner} small />}<strong>{event.role === 'assistant' ? 'Claude Code' : event.role === 'tool' ? 'Tool activity' : task.owner}</strong><span>{event.time}</span><a href={`#${event.id}`} aria-label={`Link to ${event.title}`}>#</a></div>{event.role === 'tool' ? <details><summary>{event.title}</summary><pre><code>{event.content}</code></pre><span className="fixture-label">Sanitized example · tool result excerpt only</span></details> : <p className="message-content">{event.content}</p>}</article>)}</div>{!events.length && <EmptyState title="No events found">Change the search or event filter to see more.</EmptyState>}</section><aside className="detail-aside"><h2>Session context</h2><dl><dt>Sharing</dt><dd>{state.sharingPaused ? 'Sample sharing paused' : 'Sample history only'}</dd><dt>Capture</dt><dd>Fixture · no live adapter</dd><dt>Scope</dt><dd>{task.scope}</dd><dt>Files</dt><dd>{task.files.map(file => <code className="file-tag" key={file}>{file}</code>)}</dd></dl><CopyButton value={events.map(event => `${event.role}: ${event.content}`).join('\n\n')} label="Copy visible transcript" /><Link className="text-link" href="/coordination/sample-check">View related check <ArrowRight size={14} aria-hidden="true" /></Link></aside></div></>;
}
