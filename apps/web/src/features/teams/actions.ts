"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { repositoryNameSchema } from "@workspace/core";
import { repositoryInput } from "@/features/live/repository-input";
import { createSupabaseServer } from "@/lib/supabase/server";
import { inviteTokenFromInput, teamErrorMessage } from "./invite";
import { rememberPendingInvite } from "./pending-invite";
import { callTeams } from "./teams-api";

export type TeamFormState = { error: string };

async function signedInClient() {
  const client = await createSupabaseServer();
  if (!client) return null;
  const { data } = await client.auth.getUser().catch(() => ({ data: { user: null } }));
  return data.user ? client : null;
}

export async function createTeam(_previous: TeamFormState, form: FormData): Promise<TeamFormState> {
  const client = await signedInClient();
  if (!client) redirect("/login");
  const teamName = String(form.get("team_name") ?? "").trim();
  const repositoryName = repositoryInput(String(form.get("repository") ?? ""));
  if (teamName.length < 2 || teamName.length > 80)
    return { error: "Team name must be 2 to 80 characters." };
  if (!repositoryName || !repositoryNameSchema.safeParse(repositoryName).success)
    return { error: "Enter the GitHub repository as owner/name." };

  const result = await callTeams(client, {
    action: "create_team",
    team_name: teamName,
    repository_name: repositoryName,
  });
  if (!result.ok) return { error: teamErrorMessage(result.code) };
  redirect("/live");
}

export async function openInviteLink(
  _previous: TeamFormState,
  form: FormData,
): Promise<TeamFormState> {
  const token = inviteTokenFromInput(String(form.get("invite") ?? ""));
  if (!token) return { error: "Paste the full invite link." };
  redirect(`/invite/${token}`);
}

export async function rotateInvite(teamId: string) {
  const client = await signedInClient();
  if (!client) redirect("/login");
  const result = await callTeams(client, { action: "rotate_invite", team_id: teamId });
  if (!result.ok) redirect(`/live?error=${result.code}`);
  revalidatePath("/live");
}

export async function signInToJoin(token: string) {
  if (inviteTokenFromInput(token) === token) await rememberPendingInvite(token);
  redirect("/login");
}

export async function acceptInvite(token: string) {
  const client = await signedInClient();
  if (!client) return signInToJoin(token);
  const result = await callTeams(client, { action: "accept_invite", token });
  if (!result.ok) redirect(`/invite/${token}?error=${result.code}`);
  redirect("/live");
}
