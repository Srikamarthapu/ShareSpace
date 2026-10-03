"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  teamRowSchema,
  repositoryRowSchema,
  memberRowSchema,
  deviceRowSchema,
  sharingSettingRowSchema,
  sessionRowSchema,
  eventRowSchema,
  overlapCheckRowSchema,
  storageStatusSchema,
  cleanupNoticeRowSchema,
  type TeamRow,
  type RepositoryRow,
  type MemberRow,
  type DeviceRow,
  type SharingSettingRow,
  type SessionRow,
  type EventRow,
  type OverlapCheckRow,
  type StorageStatus,
  type CleanupNoticeRow,
} from "@workspace/core";
import { createSupabaseBrowser } from "@/lib/supabase/client";

export interface WorkspaceData {
  team: TeamRow | null;
  repository: RepositoryRow | null;
  repositories: RepositoryRow[];
  members: MemberRow[];
  devices: DeviceRow[];
  sharing: SharingSettingRow | null;
  sessions: SessionRow[];
  selected: SessionRow | null;
  events: EventRow[];
  warnings: OverlapCheckRow[];
  storage: StorageStatus | null;
  cleanup: CleanupNoticeRow[];
}
const empty: WorkspaceData = {
  team: null,
  repository: null,
  repositories: [],
  members: [],
  devices: [],
  sharing: null,
  sessions: [],
  selected: null,
  events: [],
  warnings: [],
  storage: null,
  cleanup: [],
};
function rows<T>(schema: z.ZodType<T>, result: { data: unknown; error: unknown }): T[] {
  if (result.error)
    throw new Error("Workspace data is unavailable. Please refresh or sign in again.");
  const parsed = z.array(schema).safeParse(result.data);
  if (!parsed.success)
    throw new Error(
      "The workspace returned an unsupported data format. Please contact your administrator.",
    );
  return parsed.data;
}

export function useLiveWorkspace(
  userId: string,
  sessionId: string | undefined,
  eventLimit: number,
  repositoryId?: string,
) {
  const [client] = useState(createSupabaseBrowser);
  const [data, setData] = useState<WorkspaceData>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [connection, setConnection] = useState("Connecting");
  const running = useRef(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    const current = generation.current;
    try {
      const { data: identity, error: authError } = await client.auth.getUser();
      if (authError || identity.user?.id !== userId)
        throw new Error("Your session has expired. Sign in again to continue.");
      const membership = rows(
        memberRowSchema,
        await client.from("team_members").select("*").eq("user_id", userId),
      )[0];
      if (!membership) {
        if (current === generation.current) {
          setData(empty);
          setError("");
          setUpdatedAt(new Date().toISOString());
        }
        return;
      }
      const teamId = membership.team_id;
      const results = await Promise.all([
        client.from("teams").select("*").eq("id", teamId),
        client.from("repositories").select("*").eq("team_id", teamId).order("created_at").limit(5),
        client.from("team_members").select("*").eq("team_id", teamId).order("joined_at"),
        client
          .from("devices")
          .select("*")
          .eq("team_id", teamId)
          .order("created_at", { ascending: false })
          .limit(100),
        client.from("sharing_settings").select("*").eq("user_id", userId).eq("team_id", teamId),
        client
          .from("sessions")
          .select("*")
          .eq("team_id", teamId)
          .order("last_activity_at", { ascending: false })
          .limit(100),
        client
          .from("overlap_checks")
          .select("*")
          .eq("team_id", teamId)
          .order("created_at", { ascending: false })
          .limit(100),
        client.rpc("storage_status"),
        client
          .from("cleanup_notices")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      const repositories = rows(repositoryRowSchema, results[1]);
      const repository =
        repositories.find((row) => row.id === repositoryId) ?? repositories[0] ?? null;
      const sessions = rows(sessionRowSchema, results[5]);
      let selected = sessions.find((row) => row.id === sessionId) ?? null;
      if (sessionId && !selected)
        selected =
          rows(
            sessionRowSchema,
            await client.from("sessions").select("*").eq("id", sessionId),
          )[0] ?? null;
      let events: EventRow[] = [];
      if (selected && !selected.history_removed_at) {
        // Replace the visible window, including on reconnect. Identity allocation order alone can miss late commits.
        events = rows(
          eventRowSchema,
          await client
            .from("session_events")
            .select("*")
            .eq("session_id", selected.id)
            .order("sequence", { ascending: false })
            .order("occurred_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(eventLimit),
        ).reverse();
      }
      const storage = results[7].error ? null : storageStatusSchema.safeParse(results[7].data);
      if (current === generation.current) {
        setData({
          team: rows(teamRowSchema, results[0])[0] ?? null,
          repository,
          repositories,
          members: rows(memberRowSchema, results[2]),
          devices: rows(deviceRowSchema, results[3]),
          sharing:
            rows(sharingSettingRowSchema, results[4]).find(
              (row) => row.repository_id === repository?.id,
            ) ?? null,
          sessions,
          selected,
          events,
          warnings: rows(overlapCheckRowSchema, results[6]),
          storage: storage?.success ? storage.data : null,
          cleanup: rows(cleanupNoticeRowSchema, results[8]),
        });
        setError("");
        setUpdatedAt(new Date().toISOString());
      }
    } catch (cause) {
      if (current === generation.current) {
        setData(empty);
        setError(cause instanceof Error ? cause.message : "Workspace unavailable. Try again.");
      }
    } finally {
      running.current = false;
      if (current === generation.current) setLoading(false);
    }
  }, [client, userId, sessionId, eventLimit, repositoryId]);
  useEffect(() => {
    generation.current += 1;
    const timer = window.setInterval(() => {
      void refresh();
    }, 5_000);
    const initial = window.setTimeout(() => {
      void refresh();
    }, 0);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    const online = () => {
      setConnection("Reconnecting");
      void refresh();
    };
    const offline = () => {
      setConnection("Offline");
      setData(empty);
      setError("You are offline. Reconnect to read the latest workspace.");
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    return () => {
      generation.current += 1;
      window.clearInterval(timer);
      window.clearTimeout(initial);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  useEffect(() => {
    if (!data.team?.id) return;
    let channel = client.channel(`workspace:${data.team.id}`);
    for (const table of [
      "sessions",
      "session_events",
      "overlap_checks",
      "cleanup_notices",
      "team_members",
      "devices",
      "sharing_settings",
    ]) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `team_id=eq.${data.team.id}` },
        () => {
          void refresh();
        },
      );
    }
    channel.subscribe((status) => {
      setConnection(status === "SUBSCRIBED" ? "Live updates" : "Polling every 5 seconds");
      if (status === "SUBSCRIBED") void refresh();
    });
    return () => {
      void client.removeChannel(channel);
    };
  }, [client, data.team?.id, refresh]);
  return { client, data, loading, error, updatedAt, connection, refresh };
}

const errorMessages: Record<string, string> = {
  forbidden: "You do not have permission to do that.",
  not_member: "You are no longer a member of this team.",
  already_in_team: "You already belong to a team. Use your current workspace.",
  last_admin: "The last administrator cannot be removed.",
  invite_rotated: "This invitation was replaced. Ask the team administrator for a new link.",
  not_found: "That invitation, device, or session is unavailable.",
  pairing_expired: "This pairing code expired. Start pairing again from your terminal.",
  repository_mismatch: "The device repository does not match your team repository.",
  unauthenticated: "Your session expired. Sign in again.",
  invalid_request: "The request contains invalid details. Check the form fields and try again.",
  rate_limited: "Too many requests. Wait a moment and try again.",
  unavailable: "The workspace service is unavailable. Please try again.",
};
export async function mutate(
  client: ReturnType<typeof createSupabaseBrowser>,
  name: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const result = await client.functions.invoke(name, { body });
  if (result.error) {
    const context = result.error.context;
    const payload = context instanceof Response ? await context.json().catch(() => null) : null;
    throw new Error(
      errorMessages[payload?.error?.code] ??
        "The operation could not be completed. Please retry or contact your administrator.",
    );
  }
  return result.data;
}
