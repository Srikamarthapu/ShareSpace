export function apiError(status: number, code: string, message: string, requestId = crypto.randomUUID()) {
  return Response.json({ error: { code, message }, request_id: requestId }, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Request-ID': requestId } });
}
export class BodyTooLargeError extends Error {}
export async function boundedText(request: Request, maxBytes = 512 * 1024): Promise<string> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new BodyTooLargeError('Request body is too large.');
  if (!request.body) return '';
  const reader = request.body.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new BodyTooLargeError('Request body is too large.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function hasSameOrigin(request: Request, expectedOrigin = new URL(request.url).origin) {
  return request.headers.get('origin') === expectedOrigin;
}
