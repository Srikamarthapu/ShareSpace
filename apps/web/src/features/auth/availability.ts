import "server-only";
import { supabaseConfig } from "@/lib/supabase/config";

export type ProviderAvailability = "enabled" | "disabled" | "unknown";

export async function githubAvailability(): Promise<ProviderAvailability> {
  const config = supabaseConfig();
  if (!config) return "disabled";
  try {
    const response = await fetch(new URL("/auth/v1/settings", config.url), {
      headers: { apikey: config.key },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return "unknown";
    const settings: unknown = await response.json();
    if (typeof settings !== "object" || !settings || !("external" in settings)) return "unknown";
    const external = settings.external;
    if (typeof external !== "object" || !external || !("github" in external)) return "unknown";
    return external.github === true
      ? "enabled"
      : external.github === false
        ? "disabled"
        : "unknown";
  } catch {
    return "unknown";
  }
}
