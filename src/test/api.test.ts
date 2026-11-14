import { describe, expect, spyOn, test } from 'bun:test';
import { Api } from '../leetcode/api';
import { isTimeout } from '../leetcode/http';
import type { Session } from '../leetcode/session';

const signedOut = { read: async () => undefined } as unknown as Session;

function timeoutError(): DOMException {
  // What an expired AbortSignal.timeout rejects with, as Node's fetch reports it.
  return new DOMException('The operation was aborted due to timeout', 'TimeoutError');
}

describe('isTimeout', () => {
  test('recognises what an expired AbortSignal.timeout rejects with', () => {
    expect(isTimeout(timeoutError())).toBe(true);
    expect(isTimeout(new DOMException('aborted', 'AbortError'))).toBe(true);
  });

  test('does not mistake other failures for one', () => {
    expect(isTimeout(new TypeError('fetch failed'))).toBe(false);
    expect(isTimeout('timeout')).toBe(false);
    expect(isTimeout(undefined)).toBe(false);
    expect(isTimeout(null)).toBe(false);
  });
});

/**
 * Without a deadline a stalled GraphQL request hangs whatever waits on it — a
 * tree view's spinner, a progress notification — and nothing says why.
 */
describe('Api.graphql', () => {
  test('sends every request with a deadline', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true } })),
    );
    try {
      await new Api(signedOut).graphql('query { ok }');
      const init = fetchSpy.mock.calls[0]?.[1];
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test('a request that runs out of time says so', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockRejectedValue(timeoutError());
    try {
      await expect(new Api(signedOut).graphql('query { ok }')).rejects.toThrow(
        'LeetCode did not answer within 20 seconds',
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test('an answer that is not JSON is named as such, not as a parse error', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<!DOCTYPE html><title>Just a moment...</title>'),
    );
    try {
      await expect(new Api(signedOut).graphql('query { ok }')).rejects.toThrow(
        'LeetCode replied with something that was not JSON',
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
