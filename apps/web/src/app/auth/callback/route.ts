import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { authCallbackInput } from "@/features/auth/callback";
import { takePostSignInPath } from "@/features/teams/pending-invite";

export async function GET(request: NextRequest) {
  const input = authCallbackInput(request.nextUrl);
  const finish = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url), 303);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  if ("error" in input) return finish(`/login?error=${input.error}`);
  try {
    const client = await createSupabaseServer();
    if (!client) return finish("/login?error=unavailable");
    const { error } = await client.auth.exchangeCodeForSession(input.code);
    if (error) return finish("/login?error=callback");
    return finish(await takePostSignInPath());
  } catch {
    return finish("/login?error=unavailable");
  }
}
