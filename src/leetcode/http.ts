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

/** The headers that make a request count as signed in. */
export function credentialHeaders(credentials: Credentials): Record<string, string> {
  return {
    Cookie: `LEETCODE_SESSION=${credentials.session}; csrftoken=${credentials.csrfToken}`,
    'x-csrftoken': credentials.csrfToken,
  };
}
