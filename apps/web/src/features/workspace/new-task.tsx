'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useWorkspace } from '@/components/workspace-provider';

export function NewTask() {
  const router = useRouter();
  const { state, update } = useWorkspace();
  const [error, setError] = useState('');
  function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') ?? '').trim();
    const scope = String(form.get('scope') ?? '').trim();
    if (!title || !scope) { setError('Add a title and scope.'); return; }
    if (state.tasks.length >= 20) { setError('This sample supports up to 20 tasks. Reset it in Settings to start again.'); return; }
    const id = `sample-${crypto.randomUUID()}`;
    if (update(current => ({ ...current, tasks: [...current.tasks, { id, title, scope, owner: 'Sri', state: 'proposed', branch: 'Not selected', files: [], sessionId: id }] }), 'Sample task created. No agent has started work.')) router.push('/');
    else setError('Could not save the task. Try again.');
  }
  return <><Link className="back-link" href="/"><ArrowLeft size={15} aria-hidden="true" />Workspace</Link><div className="page-heading"><div><div className="eyebrow">DECLARE YOUR INTENT</div><h1>What are you building?</h1><p>A proposed task makes the scope visible before implementation starts.</p></div></div><form className="form-panel narrow" onSubmit={submit}><label htmlFor="task-title">Task title</label><input id="task-title" name="title" maxLength={100} required placeholder="e.g. Shortlist empty states" /><label htmlFor="task-scope">Intended outcome</label><textarea id="task-scope" name="scope" rows={5} maxLength={2000} required placeholder="What will change, and what is outside this task?" /><p className="muted small">Created for Sri in this browser. No preflight check or agent action is triggered.</p>{error && <p role="alert" className="error-text">{error}</p>}<button className="button button-primary" type="submit">Create sample task<ArrowRight size={15} aria-hidden="true" /></button></form></>;
}
