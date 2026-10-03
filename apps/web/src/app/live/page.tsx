import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { LiveWorkspace } from "@/features/live/workspace";
export const dynamic = "force-dynamic";
export const metadata = { title: "Workspace" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const clean = Object.fromEntries(
    Object.entries(params).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const client = await createSupabaseServer();
  const result = client ? await client.auth.getUser().catch(() => null) : null;
  if (!result?.data.user || result.error)
    redirect(`/login?next=${encodeURIComponent(`/live?${new URLSearchParams(clean)}`)}`);
  const user = result.data.user;
  return (
    <LiveWorkspace
      key={`${user.id}:${clean.repository ?? ""}:${clean.session ?? ""}`}
      user={{ id: user.id, email: user.email ?? "Signed-in member" }}
      query={clean}
    />
  );
}
