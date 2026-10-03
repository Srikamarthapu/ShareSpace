// `teams` Edge Function: create a team, manage its invite link, join, and remove members.
// Request and response shapes: packages/core/src/v1.ts (teamsRequestSchema, teamsResponseSchemas).
//
// The caller is the user in the Authorization JWT, checked with Supabase Auth on every request.
// A user ID in the body never grants access. The work happens in private.* SQL functions,
// which only this function's direct database connection may execute.
import postgres from "npm:postgres@3.4.5";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false });
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const apiKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const errorStatus = {
  invalid_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_member: 403,
  not_found: 404,
  already_in_team: 409,
  last_admin: 409,
  invite_rotated: 409,
  internal: 500,
} as const;
type ErrorCode = keyof typeof errorStatus;

class ApiError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invitePattern = /^ssi-[0-9a-f]{64}$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function field(body: Record<string, unknown>, name: string, pattern?: RegExp): string {
  const value = body[name];
  if (typeof value !== "string" || value.length > 300 || (pattern && !pattern.test(value)))
    throw new ApiError("invalid_request");
  return value;
}

type User = { id: string; email?: string; user_metadata?: Record<string, unknown> };

async function currentUser(request: Request): Promise<User | null> {
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: apiKey, Authorization: authorization },
  });
  if (!response.ok) return null;
  const user = (await response.json()) as User;
  // The publishable/anon key alone is a JWT without a user; it does not count as signed in.
  return typeof user?.id === "string" && uuidPattern.test(user.id) ? user : null;
}

// Display details for the member row. Metadata is user-editable, so it is used only for
// display, never for access decisions.
function memberProfile(user: User) {
  const metadata = user.user_metadata ?? {};
  const pick = (key: string) =>
    typeof metadata[key] === "string" ? (metadata[key] as string).trim() : "";
  const name =
    pick("full_name") || pick("name") || pick("user_name") || user.email?.split("@")[0] || "Member";
  const avatar = pick("avatar_url");
  return {
    displayName: name.slice(0, 100),
    avatarUrl: avatar.startsWith("https://") && avatar.length <= 2000 ? avatar : null,
  };
}

async function run(action: string, body: Record<string, unknown>, user: User | null) {
  if (action === "preview_invite") {
    const token = field(body, "token", invitePattern);
    return (await sql`select private.preview_invite(${token}) as result`)[0].result;
  }
  if (!user) throw new ApiError("unauthenticated");
  const profile = memberProfile(user);

  switch (action) {
    case "create_team": {
      const teamName = field(body, "team_name");
      const repositoryName = field(body, "repository_name");
      return (
        await sql`select private.create_team(
          ${user.id}, ${profile.displayName}, ${profile.avatarUrl}, ${teamName}, ${repositoryName}
        ) as result`
      )[0].result;
    }
    case "get_invite": {
      const teamId = field(body, "team_id", uuidPattern);
      return (await sql`select private.get_invite(${user.id}, ${teamId}) as result`)[0].result;
    }
    case "rotate_invite": {
      const teamId = field(body, "team_id", uuidPattern);
      return (await sql`select private.rotate_invite(${user.id}, ${teamId}) as result`)[0].result;
    }
    case "accept_invite": {
      const token = field(body, "token", invitePattern);
      return (
        await sql`select private.accept_invite(
          ${user.id}, ${profile.displayName}, ${profile.avatarUrl}, ${token}
        ) as result`
      )[0].result;
    }
    case "remove_member": {
      const teamId = field(body, "team_id", uuidPattern);
      const memberId = field(body, "user_id", uuidPattern);
      return (
        await sql`select private.remove_member(${user.id}, ${teamId}, ${memberId}) as result`
      )[0].result;
    }
    default:
      throw new ApiError("invalid_request");
  }
}

function toApiError(error: unknown): ErrorCode {
  if (error instanceof ApiError) return error.code;
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  // The SQL functions raise contract error codes as their message.
  if (code === "P0001" && message && message in errorStatus) return message as ErrorCode;
  // Check-constraint, length, and format failures mean the input was not acceptable.
  if (code === "23514" || code === "22001" || code === "22P02") return "invalid_request";
  return "internal";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST")
    return json({ error: { code: "invalid_request", message: "Use POST." } }, 400);

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || typeof body.action !== "string")
      throw new ApiError("invalid_request");
    const user = await currentUser(request);
    return json(await run(body.action, body as Record<string, unknown>, user));
  } catch (error) {
    const code = toApiError(error);
    // Log only the error type: SQL errors can carry parameters such as invite tokens.
    if (code === "internal")
      console.error("teams function failed", (error as { code?: string })?.code ?? "unknown");
    return json({ error: { code, message: code.replaceAll("_", " ") } }, errorStatus[code]);
  }
});
