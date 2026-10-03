'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase/server';

export type LoginState = { error: string };
export async function signIn(_previous: LoginState, form: FormData): Promise<LoginState> {
  const input = z.object({ email: z.email().max(254), password: z.string().min(1).max(256) }).safeParse({ email: form.get('email'), password: form.get('password') });
  if (!input.success) return { error: 'Enter a valid email and password.' };
  const client = await createSupabaseServer();
  if (!client) return { error: 'Configure Supabase first using apps/web/.env.example.' };
  try {
    const { error } = await client.auth.signInWithPassword(input.data);
    if (error) return { error: 'Sign-in failed. Check your credentials and try again.' };
  } catch { return { error: 'Authentication is unavailable. Please try again.' }; }
  redirect('/live');
}
export async function signOut() {
  const client = await createSupabaseServer();
  if (client) {
    const { error } = await client.auth.signOut();
    if (error) throw new Error('Could not sign out. Please try again.');
  }
  redirect('/login');
}
