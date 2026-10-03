"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/app-origin";
import { takePostSignInPath } from "@/features/teams/pending-invite";
import { safeWorkspaceReturn } from "./return-path";

export type LoginState = { error: string };
export async function signIn(_previous: LoginState, form: FormData): Promise<LoginState> {
  const input = z
    .object({ email: z.email().max(254), password: z.string().min(1).max(256) })
    .safeParse({ email: form.get("email"), password: form.get("password") });
  if (!input.success) return { error: "Enter a valid email and password." };
  const client = await createSupabaseServer();
  if (!client) return { error: "Configure Supabase first using the root .env.example." };
  try {
    const { error } = await client.auth.signInWithPassword(input.data);
    if (error) return { error: "Sign-in failed. Check your credentials and try again." };
  } catch {
    return { error: "Authentication is unavailable. Please try again." };
  }
  redirect(await takePostSignInPath(safeWorkspaceReturn(form.get("next"))));
}

export type SignUpState = { error: string; notice: string };
export async function signUp(_previous: SignUpState, form: FormData): Promise<SignUpState> {
  const input = z
    .object({
      name: z.string().trim().min(1).max(100),
      email: z.email().max(254),
      password: z.string().min(8).max(256),
    })
    .safeParse({
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
    });
  if (!input.success)
    return {
      error: "Enter your name, an email, and a password of at least 8 characters.",
      notice: "",
    };
  const client = await createSupabaseServer();
  if (!client)
    return { error: "Configure Supabase first using the root .env.example.", notice: "" };
  let signedIn = false;
  try {
    const callback = new URL("/auth/callback", await appOrigin());
    const returnTo = safeWorkspaceReturn(form.get("next"));
    if (returnTo !== "/live") callback.searchParams.set("next", returnTo);
    const { data, error } = await client.auth.signUp({
      email: input.data.email,
      password: input.data.password,
      options: {
        data: { full_name: input.data.name },
        emailRedirectTo: callback.href,
      },
    });
    if (error)
      return {
        error:
          error.code === "weak_password"
            ? "Choose a stronger password."
            : "Could not create the account. Try again or sign in.",
        notice: "",
      };
    signedIn = Boolean(data.session);
  } catch {
    return { error: "Authentication is unavailable. Please try again.", notice: "" };
  }
  // With email confirmation on, the confirmation link finishes sign-in through /auth/callback.
  if (!signedIn) return { error: "", notice: "Check your email to confirm your account." };
  redirect(await takePostSignInPath(safeWorkspaceReturn(form.get("next"))));
}
export async function signOut() {
  const client = await createSupabaseServer();
  if (client) {
    const { error } = await client.auth.signOut();
    if (error) throw new Error("Could not sign out. Please try again.");
  }
  redirect("/login");
}
