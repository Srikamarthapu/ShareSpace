import { describe, expect, it } from 'vitest';
import { BodyTooLargeError, boundedText, hasSameOrigin } from './http';
describe('request boundaries', () => {
  it('caps actual stream bytes even without a content length', async () => {
    const request = new Request('https://example.com', { method: 'POST', body: 'é'.repeat(6) });
    await expect(boundedText(request, 10)).rejects.toBeInstanceOf(BodyTooLargeError);
  });
  it('requires the exact configured origin for browser mutations', () => {
    expect(hasSameOrigin(new Request('https://example.com/api', { headers: { origin: 'https://evil.example' } }))).toBe(false);
    expect(hasSameOrigin(new Request('https://example.com/api'))).toBe(false);
    expect(hasSameOrigin(new Request('https://example.com/api', { headers: { origin: 'https://example.com' } }))).toBe(true);
  });
});
