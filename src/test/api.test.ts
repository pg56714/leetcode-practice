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

/** The question node LeetCode returns for one problem, trimmed to what is read. */
function questionNode(slug: string) {
  return {
    question: {
      questionId: '1',
      questionFrontendId: '1',
      title: slug,
      titleSlug: slug,
      content: '<p>Given an array…</p>',
      difficulty: 'Easy',
      isPaidOnly: false,
      sampleTestCase: '[2,7,11,15]\n9',
      exampleTestcases: '[2,7,11,15]\n9',
      metaData: null,
      codeSnippets: [{ lang: 'Python3', langSlug: 'python3', code: 'class Solution: pass' }],
      topicTags: [],
    },
  };
}

/**
 * Statements and templates do not change while someone is solving, yet Show
 * Statement and Change Language each refetched the whole problem.
 */
describe('Api.questionDetail', () => {
  function apiAnswering() {
    const api = new Api(signedOut);
    const graphql = spyOn(api, 'graphql').mockImplementation(
      async (_document, variables) => questionNode(String(variables?.titleSlug)) as never,
    );
    return { api, graphql };
  }

  test('fetches a problem once, however often it is asked for', async () => {
    const { api, graphql } = apiAnswering();
    await Promise.all([api.questionDetail('two-sum'), api.questionDetail('two-sum')]);
    await api.questionDetail('two-sum');
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  test('does not keep a failure, so the next call tries again', async () => {
    const api = new Api(signedOut);
    const graphql = spyOn(api, 'graphql')
      .mockRejectedValueOnce(new Error('LeetCode replied with HTTP 502'))
      .mockResolvedValueOnce(questionNode('two-sum') as never);

    await expect(api.questionDetail('two-sum')).rejects.toThrow('HTTP 502');
    expect((await api.questionDetail('two-sum')).slug).toBe('two-sum');
    expect(graphql).toHaveBeenCalledTimes(2);
  });

  test('starts over once told to forget, as after an account change', async () => {
    const { api, graphql } = apiAnswering();
    await api.questionDetail('two-sum');
    api.forgetDetails();
    await api.questionDetail('two-sum');
    expect(graphql).toHaveBeenCalledTimes(2);
  });

  test('keeps the fifty most recently used', async () => {
    const { api, graphql } = apiAnswering();
    for (let index = 0; index <= 50; index++) {
      await api.questionDetail(`problem-${index}`);
    }
    expect(graphql).toHaveBeenCalledTimes(51);

    await api.questionDetail('problem-50');
    expect(graphql).toHaveBeenCalledTimes(51);
    // The first was the least recently used, so it went to make room.
    await api.questionDetail('problem-0');
    expect(graphql).toHaveBeenCalledTimes(52);
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
