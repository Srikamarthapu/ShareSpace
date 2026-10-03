// Defense in depth: the adapter redacts before upload and the service repeats it.
// No regex is a promise of complete secret detection; sharing stays explicit opt-in.
const patterns = [
  /\bss[idp]-[0-9a-f]{64}\b/g,
  /\bsb_secret_[A-Za-z0-9_-]{12,}\b/g,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@[^\s]+/gi,
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}={0,2}/gi,
  /\b(?:sk-(?:ant|proj|live|test)-|sk_(?:live|test)_|rk_(?:live|test)_|github_pat_|gh[pousr]_|xox[baprs]-|npm_)[A-Za-z0-9_-]{12,}\b/gi,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b[\w-]*(?:api[_-]?key|token|password|secret|authorization)\b\s*[:=]\s*["']?[^\s,"'}]+/gi,
];
export function redactText(input: string): string {
  let result = input.replace(/\u0000/g, '');
  for (const pattern of patterns) result = result.replace(pattern, '[REDACTED]');
  return result
    .replace(/(^|[\s"'=([{])\/(?!\/)(?:[A-Za-z0-9._~+-]+\/)*[A-Za-z0-9._~+-]+/g, '$1[PATH]')
    .replace(/\b[A-Za-z]:\\(?:[^\\\s"'<>|]+\\)*[^\\\s"'<>|]*/g, '[PATH]');
}
export function sensitivePath(value: string): boolean {
  return value.split('/').some((part) => /^(?:\.env(?:\..*)?|\.git|\.ssh|\.aws|\.gnupg|\.npmrc|\.netrc|secrets?|credentials(?:\..*)?|id_(?:rsa|ed25519)|.*\.(?:pem|key|p12|pfx))$/i.test(part));
}
export function redactPayload(value: unknown): unknown {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(redactPayload);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      key === 'relative_paths' && Array.isArray(item)
        ? item.filter((path) => typeof path === 'string' && !sensitivePath(path)).map(redactPayload)
        : redactPayload(item)]));
  }
  return value;
}
