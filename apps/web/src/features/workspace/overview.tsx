'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, CircleDot, FileCode2, GitBranch, GitCompareArrows, Plus, Plug, ShieldCheck, Sparkles } from 'lucide-react';
import { useWorkspace } from '@/components/workspace-provider';
import { Avatar, EmptyState } from '@/components/ui';
import { sampleEvents } from '@/lib/sample-data';
import { TaskCard } from './task-card';

export function Overview() {
  const { state } = useWorkspace();
  const [filter, setFilter] = useState('all');
  const tasks = state.tasks.filter(task => filter === 'all' || task.owner === filter);
  return <>
    <div className="page-heading"><div><div className="eyebrow">YOUR SHARED WORKBENCH</div><h1>Build together. Stay in sync.</h1><p>The people, agents, and context behind your next change.</p></div><Link className="button button-primary" href="/connect"><Plug size={16} aria-hidden="true" />Connect agent</Link></div>
    <div className="context-strip"><span className="context-icon"><GitCompareArrows size={22} aria-hidden="true" /></span><div><strong>{state.resolution ? 'A clearer boundary. A better next step.' : 'A little context before your next commit.'}</strong><p>{state.resolution ? 'Your sample scope is saved. Preview the context for your next prompt.' : 'Sri’s shortlist and Sam’s API may overlap. Turn two similar requests into complementary work.'}</p></div><Link href="/coordination/sample-check">{state.resolution ? 'View handoff' : 'Review overlap'}<ArrowRight size={16} aria-hidden="true" /></Link></div>
    <div className="workspace-grid"><div className="workspace-main">
      <section aria-labelledby="current-work-heading"><div className="section-heading"><h2 id="current-work-heading">Current work <span className="count">{state.tasks.length}</span></h2><Link className="text-link" href="/tasks/new"><Plus size={15} aria-hidden="true" />New task</Link></div>
        <div className="filter-row" role="group" aria-label="Filter tasks by builder">{[{ id: 'all', label: 'Everyone' }, { id: 'Sam', label: 'Sam' }, { id: 'Sri', label: 'Sri' }].map(item => <button key={item.id} aria-pressed={filter === item.id} className={`filter ${filter === item.id ? 'selected' : ''}`} onClick={() => setFilter(item.id)}>{item.label}</button>)}<span className="filter-description">2 example builder–agent pairs</span></div>
        <div className="task-grid">{tasks.map(task => <TaskCard task={task} key={task.id} />)}</div>{tasks.length === 0 && <EmptyState title="No tasks in this view">Choose another builder to see their sample work.</EmptyState>}
      </section>
      <section className="activity-section" aria-labelledby="activity-heading"><div className="section-heading"><h2 id="activity-heading">Recent activity</h2><Link href="/sessions" className="text-link">All sessions<ArrowUpRight size={14} aria-hidden="true" /></Link></div><div className="activity-panel"><div className="activity-day">SAMPLE HISTORY <span>OCT 3, 2026</span></div><ol className="activity-list">{[...sampleEvents].reverse().slice(0, 4).map(event => <li key={event.id}><span className={`activity-dot ${event.role === 'tool' ? 'tool-dot' : ''}`}>{event.role === 'tool' ? <FileCode2 size={14} aria-hidden="true" /> : event.sessionId === 'sample-sam' ? 'SA' : 'SK'}</span><div><Link href={`/sessions/${event.sessionId}#${event.id}`}>{event.title}</Link><p>{event.file ?? (event.sessionId === 'sample-sam' ? 'Saved-college API' : 'Personal shortlist')}<span> · {event.role === 'tool' ? 'Tool event' : 'Shared message'}</span></p></div><time>{event.time}</time></li>)}</ol></div></section>
      <section className="coverage-card" aria-labelledby="coverage-heading"><span className="coverage-icon"><GitBranch size={20} aria-hidden="true" /></span><div><h2 id="coverage-heading">Know what your evidence covers.</h2><p>This sample contains a planned API and shared intent. No real repository has been indexed.</p></div><Link href="/settings#coverage" aria-label="View source coverage settings"><ArrowUpRight size={19} aria-hidden="true" /></Link></section>
    </div><aside className="inspector" aria-label="Coordination and team">
      <section><div className="section-heading"><h2>Coordination</h2><span className="count">{state.resolution ? 0 : 1}</span></div><div className={`coordination-card ${state.resolution ? 'resolved-card' : ''}`}><div className="small-label">{state.resolution ? <Check size={14} aria-hidden="true" /> : <CircleDot size={14} aria-hidden="true" />}{state.resolution ? 'SCOPE SAVED' : 'REVIEW SUGGESTED'}</div><div className="overlapping-avatars"><Avatar name="Sam" small /><Avatar name="Sri" small /></div><h3>{state.resolution ? 'Ready for the next prompt' : 'Similar outcome, shared opportunity.'}</h3><p>{state.resolution ? 'The sample decision is saved. Delivery to an agent has not occurred.' : 'Sam is building the API your shortlist needs. Agree on the boundary before starting.'}</p><Link href="/coordination/sample-check" className="button button-secondary full-width">{state.resolution ? 'Preview context' : 'Compare the work'}<ArrowRight size={14} aria-hidden="true" /></Link><span className="fixture-label">Scripted example · not a live check</span></div></section>
      <section className="team-section"><div className="section-heading"><h2>The builders</h2><span className="muted small">Sample team</span></div>{(['Sam', 'Sri'] as const).map(name => <div className="team-member" key={name}><Avatar name={name} small /><div><strong>{name}</strong><span>Claude Code</span></div><span className="sample-member-label">Example</span></div>)}</section>
      <div className="principle-note"><ShieldCheck size={19} aria-hidden="true" /><strong>Sharing is a choice.</strong><p>Connect only the sessions you choose. Private work stays private.</p><Link href="/connect">How connection works <ArrowUpRight size={13} aria-hidden="true" /></Link></div>
      <Link className="starter-note" href="/guide"><Sparkles size={16} aria-hidden="true" /><span>Built to be built on.<br /><strong>Open the starter guide <ArrowRight size={12} aria-hidden="true" /></strong></span></Link>
    </aside></div>
  </>;
}
