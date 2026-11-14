import type { Credentials } from './types';

/** The one origin every request goes to, GraphQL and judge alike. */
export const ORIGIN = 'https://leetcode.com';

/**
 * How long any request may take before it is abandoned.
 *
 * Without a limit a stalled request hangs whatever is waiting on it — a
 * progress notification, a tree view's spinner — which reads as a frozen
 * extension rather than a slow network.
 */
export const REQUEST_TIMEOUT_MS = 20_000;

/** Resolves after `ms` milliseconds, for pacing polls and retries. */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Whether a request failed by running out of time.
 *
 * Node's fetch rejects with the signal's TimeoutError whether the headers or
 * the body were still outstanding. AbortError is taken to mean the same,
 * because nothing here aborts a request any other way.
 */
export function isTimeout(err: unknown): boolean {
  const name = (err as { name?: unknown } | null | undefined)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

/** The headers that make a request count as signed in. */
export function credentialHeaders(credentials: Credentials): Record<string, string> {
  return {
    Cookie: `LEETCODE_SESSION=${credentials.session}; csrftoken=${credentials.csrfToken}`,
    'x-csrftoken': credentials.csrfToken,
  };
}
