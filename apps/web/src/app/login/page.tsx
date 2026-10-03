import Link from 'next/link';
import { Layers2, ArrowLeft, Settings2 } from 'lucide-react';
import { LoginForm } from '@/features/auth/login-form';
import { supabaseConfig } from '@/lib/supabase/config';
export const metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';
export default function Page() {
  const configured = !!supabaseConfig();
  return <main className="login-panel"><Link href="/" className="brand"><span className="brand-mark"><Layers2 size={22} aria-hidden="true" /></span>ShareSpace</Link><h1>{configured ? 'Your real workspace.' : 'Ready when you are.'}</h1><p>{configured ? 'Sign in to access project records authorized by Supabase.' : 'The sample runs without credentials. Connect Supabase to begin building with real accounts.'}</p>{configured ? <LoginForm /> : <div className="setup-panel"><Settings2 size={24} className="muted" aria-hidden="true" /><h2 className="section-spacing">Configure Supabase</h2><ol className="gate-list"><li>Copy <code>.env.example</code> to <code>.env</code> in the repo root.</li><li>Add your project URL and publishable key.</li><li>Apply the migrations and restart the app.</li></ol><p className="muted small">Follow the complete local setup in the repository README and docs/DATABASE.md.</p></div>}<Link href="/" className="text-link"><ArrowLeft size={14} aria-hidden="true" />Back to the sample workspace</Link></main>;
}
