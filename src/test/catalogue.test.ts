import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as vscode from 'vscode';
import type { Api } from '../leetcode/api';
import { Catalogue } from '../leetcode/catalogue';
import { wait } from '../leetcode/http';
import type { ProblemSummary } from '../leetcode/types';
import { memoryFs } from './memoryFs';

function summary(number: number, title = `Problem ${number}`, slug = `problem-${number}`) {
  const problem: ProblemSummary = {
    number: String(number),
    title,
    slug,
    difficulty: 'Easy',
    paidOnly: false,
    status: null,
    acRate: null,
  };
  return problem;
}

/**
 * A problem set of `total` problems, served a hundred to a page as LeetCode
 * serves it, recording how many pages were in flight at once and how often
 * each was asked for. `fails` decides which attempts throw.
 */
function problemSet(
  total: number,
  fails: (skip: number, attempt: number) => boolean = () => false,
) {
  const attempts = new Map<number, number>();
  let inFlight = 0;
  let peak = 0;

  const api = {
    problemPage: async (skip: number) => {
      const attempt = (attempts.get(skip) ?? 0) + 1;
      attempts.set(skip, attempt);
      inFlight++;
      peak = Math.max(peak, inFlight);
      await wait(1);
      inFlight--;
      if (fails(skip, attempt)) {
        throw new Error(`LeetCode replied with HTTP 502 for skip ${skip}`);
      }
      const problems: ProblemSummary[] = [];
      for (let number = skip + 1; number <= Math.min(skip + 100, total); number++) {
        problems.push(summary(number));
      }
      return { total, problems };
    },
  } as unknown as Api;

  return { api, attempts, peak: () => peak };
}

describe('fetching the problem set', () => {
  let fs: ReturnType<typeof memoryFs>;
  beforeEach(() => {
    fs = memoryFs();
  });
  afterEach(() => fs.restore());

  const storage = vscode.Uri.file('/storage');

  test('fetches every page and keeps them in number order', async () => {
    const catalogue = new Catalogue(problemSet(1050).api, storage, { retryDelayMs: 0 });
    await catalogue.refresh({ silent: true });

    expect(catalogue.size).toBe(1050);
    const numbers = catalogue.search('').map((problem) => Number(problem.number));
    expect(numbers).toEqual(Array.from({ length: 1050 }, (_, index) => index + 1));
  });

  test('keeps five pages in flight, never more', async () => {
    const set = problemSet(4046);
    await new Catalogue(set.api, storage, { retryDelayMs: 0 }).refresh({ silent: true });
    expect(set.peak()).toBe(5);
  });

  test('a page that fails once is tried again rather than losing the fetch', async () => {
    const set = problemSet(1050, (skip, attempt) => skip === 300 && attempt === 1);
    const catalogue = new Catalogue(set.api, storage, { retryDelayMs: 0 });
    await catalogue.refresh({ silent: true });

    expect(catalogue.size).toBe(1050);
    expect(set.attempts.get(300)).toBe(2);
  });

  test('a page that keeps failing gives up and keeps what was already there', async () => {
    let broken = false;
    const set = problemSet(250, (skip) => broken && skip === 100);
    const catalogue = new Catalogue(set.api, storage, { retryDelayMs: 0 });
    await catalogue.refresh({ silent: true });
    broken = true;

    await catalogue.refresh({ silent: true });

    expect(catalogue.size).toBe(250);
    // One good fetch, then three attempts before giving up.
    expect(set.attempts.get(100)).toBe(4);
  });

  test('writes what it fetched to the cache', async () => {
    await new Catalogue(problemSet(150).api, storage, { retryDelayMs: 0 }).refresh({
      silent: true,
    });
    const cached = JSON.parse(fs.read('/storage/problems.json') ?? '{}') as {
      problems?: unknown[];
    };
    expect(cached.problems).toHaveLength(150);
  });
});

/**
 * What an empty Problems view says. It used to read "No problems cached yet —
 * use Refresh." while the cache was still being read, and through the whole
 * first fetch, which is the opposite of what was happening.
 */
describe('Catalogue.busy', () => {
  let fs: ReturnType<typeof memoryFs>;
  beforeEach(() => {
    fs = memoryFs();
  });
  afterEach(() => fs.restore());

  test('is busy until the cache has been read, and while a fetch runs', async () => {
    fs.write(
      '/storage/problems.json',
      JSON.stringify({ version: 1, fetchedAt: new Date().toISOString(), problems: [summary(1)] }),
    );
    let release: () => void = () => undefined;
    const api = {
      problemPage: () =>
        new Promise((resolve) => {
          release = () => resolve({ total: 1, problems: [summary(1)] });
        }),
    } as unknown as Api;
    const catalogue = new Catalogue(api, vscode.Uri.file('/storage'));

    expect(catalogue.busy).toBe(true);
    await catalogue.prime();
    expect(catalogue.busy).toBe(false);
    expect(catalogue.size).toBe(1);

    const refreshing = catalogue.refresh({ silent: true });
    expect(catalogue.busy).toBe(true);
    release();
    await refreshing;
    expect(catalogue.busy).toBe(false);
  });

  test('says so when it changes, so the view can redraw its message', async () => {
    // No cache, so priming means the first full fetch.
    const api = { problemPage: async () => ({ total: 1, problems: [summary(1)] }) };
    const catalogue = new Catalogue(api as unknown as Api, vscode.Uri.file('/storage'));
    const seen: boolean[] = [];
    catalogue.onDidChange(() => seen.push(catalogue.busy));

    await catalogue.prime();

    expect(seen.at(0)).toBe(true);
    expect(seen.at(-1)).toBe(false);
    expect(catalogue.size).toBe(1);
  });
});

describe('Catalogue.search', () => {
  let fs: ReturnType<typeof memoryFs>;
  let catalogue: Catalogue;
  beforeEach(async () => {
    fs = memoryFs();
    const problems = [
      summary(1, 'Two Sum', 'two-sum'),
      summary(17, 'Letter Combinations of a Phone Number', 'letter-combinations-of-a-phone-number'),
      summary(49, 'Group Anagrams', 'group-anagrams'),
      summary(170, 'Two Sum III - Data structure design', 'two-sum-iii-data-structure-design'),
      summary(1700, 'Number of Students Unable to Eat Lunch', 'number-of-students-unable-to-eat'),
    ];
    const api = { problemPage: async () => ({ total: problems.length, problems }) };
    catalogue = new Catalogue(api as unknown as Api, vscode.Uri.file('/storage'));
    await catalogue.refresh({ silent: true });
  });
  afterEach(() => fs.restore());

  const numbers = (query: string) => catalogue.search(query).map((problem) => problem.number);

  test('a number matches by prefix, so 17 comes before the 1700s', () => {
    expect(numbers('17')).toEqual(['17', '170', '1700']);
  });

  test('words match the title or the slug, whatever the case', () => {
    expect(numbers('two sum')).toEqual(['1', '170']);
    expect(numbers('ANAGRAM')).toEqual(['49']);
    expect(numbers('unable-to-eat')).toEqual(['1700']);
  });

  test('an empty query is the whole set', () => {
    expect(numbers('  ')).toHaveLength(5);
  });
});
