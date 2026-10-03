import { normalizeRepositoryRemote, repositoryNameSchema } from "@workspace/core";

/** Accept a repository name or GitHub remote without fetching the supplied URL. */
export function repositoryInput(value: string): string | null {
  const input = value.trim();
  const name = repositoryNameSchema.safeParse(input);
  if (name.success) return name.data.toLowerCase();
  if (/^git@github\.com:/i.test(input)) return normalizeRepositoryRemote(input);
  try {
    const url = new URL(input);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      !["github.com", "www.github.com"].includes(url.hostname.toLowerCase()) ||
      url.username ||
      url.password ||
      url.port
    )
      return null;
    return normalizeRepositoryRemote(`https://github.com${url.pathname}`);
  } catch {
    return null;
  }
}

export const repositoryInputError =
  "Enter owner/repository (for example, Srikamarthapu/ShareSpace) or the full GitHub repository URL.";
