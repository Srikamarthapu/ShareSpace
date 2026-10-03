import "server-only";
import { headers } from "next/headers";

/** The app's public origin: APP_URL when set, otherwise the current request's host. */
export async function appOrigin(): Promise<string> {
  const configured = process.env.APP_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall back to the request host below.
    }
  }
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const protocol =
    list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
