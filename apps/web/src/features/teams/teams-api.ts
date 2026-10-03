import "server-only";
import { FunctionsHttpError } from "@supabase/supabase-js";
import {
  apiErrorSchema,
  EDGE_FUNCTIONS,
  teamsRequestSchema,
  teamsResponseSchemas,
  type ApiErrorCode,
  type TeamsRequest,
} from "@workspace/core";
import type { z } from "zod";
import type { createSupabaseServer } from "@/lib/supabase/server";

type Client = NonNullable<Awaited<ReturnType<typeof createSupabaseServer>>>;
type Action = TeamsRequest["action"];
export type TeamsResult<A extends Action> =
  { ok: true; data: z.infer<(typeof teamsResponseSchemas)[A]> } | { ok: false; code: ApiErrorCode };

/** Calls the `teams` Edge Function as the signed-in user. */
export async function callTeams<A extends Action>(
  client: Client,
  request: Extract<TeamsRequest, { action: A }>,
): Promise<TeamsResult<A>> {
  const body = teamsRequestSchema.safeParse(request);
  if (!body.success) return { ok: false, code: "invalid_request" };
  try {
    const { data, error } = await client.functions.invoke(EDGE_FUNCTIONS.teams, {
      body: body.data,
    });
    if (error) {
      if (error instanceof FunctionsHttpError) {
        const failure = apiErrorSchema.safeParse(await error.context.json().catch(() => null));
        if (failure.success) return { ok: false, code: failure.data.error.code };
      }
      return { ok: false, code: "unavailable" };
    }
    const result = (teamsResponseSchemas[request.action] as z.ZodType).safeParse(data);
    return result.success
      ? { ok: true, data: result.data as z.infer<(typeof teamsResponseSchemas)[A]> }
      : { ok: false, code: "internal" };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
