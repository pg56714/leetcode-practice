import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as vscode from 'vscode';
import type { Api } from '../leetcode/api';
import { Catalogue } from '../leetcode/catalogue';
import type { ProblemSummary } from '../leetcode/types';
import { StudyListsView } from '../views/studyLists';
import { memoryFs } from './memoryFs';

function summary(number: number, status: string | null = null): ProblemSummary {
  return {
    number: String(number),
    title: `Problem ${number}`,
    slug: `problem-${number}`,
    difficulty: 'Easy',
    paidOnly: false,
    status,
    acRate: null,
  };
}

/** A promise held open until the test says otherwise, to keep a request in flight. */
function gate(): { opened: Promise<void>; open: () => void } {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

/**
 * Signing in while a load is still running.
 *
 * Both the problem set and the study lists share an in-flight load between
 * callers, which is right for two refresh clicks and wrong for an account
 * change: the load already running carries the previous account's solved
 * state. The first fetch after installing takes several seconds, which is
 * exactly when someone signs in.
 */
describe('Catalogue.refresh', () => {
  let fs: ReturnType<typeof memoryFs>;
  beforeEach(() => {
    fs = memoryFs();
  });
  afterEach(() => fs.restore());

  test('calls landing together share one fetch', async () => {
    let calls = 0;
    const api = {
      problemPage: async () => {
        calls++;
        return { total: 1, problems: [summary(1)] };
      },
    } as unknown as Api;
    const catalogue = new Catalogue(api, vscode.Uri.file('/storage'));

    await Promise.all([catalogue.refresh({ silent: true }), catalogue.refresh({ silent: true })]);
    expect(calls).toBe(1);
  });

  test("an account change mid-fetch fetches again rather than keep the old account's answer", async () => {
    const held = gate();
    let signedIn = false;
    let calls = 0;
    const api = {
      problemPage: async () => {
        calls++;
        // Decided when the request goes out, as LeetCode decides it.
        const status = signedIn ? 'ac' : null;
        if (calls === 1) {
          await held.opened;
        }
        return { total: 1, problems: [summary(1, status)] };
      },
    } as unknown as Api;
    const catalogue = new Catalogue(api, vscode.Uri.file('/storage'));

    const first = catalogue.refresh({ silent: true });
    signedIn = true;
    const again = catalogue.refresh({ silent: true, restart: true });
    held.open();
    await Promise.all([first, again]);

    expect(calls).toBe(2);
    expect(catalogue.search('')[0]?.status).toBe('ac');
  });
});

describe('StudyListsView', () => {
  test('a refresh during a load fetches again instead of keeping the stale answer', async () => {
    const held = gate();
    let account: string | undefined;
    let calls = 0;
    const api = {
      graphql: async (document: string) => {
        calls++;
        const who = account;
        if (calls === 1) {
          await held.opened;
        }
        if (document.includes('myCreatedFavoriteList')) {
          const favorites =
            who === undefined ? [] : [{ name: `${who}'s list`, slug: 'abc', questionNumber: 1 }];
          return {
            myCreatedFavoriteList: { favorites },
            myCollectedFavoriteList: { favorites: [] },
          };
        }
        throw new Error('no study plans in this test');
      },
    } as unknown as Api;
    const view = new StudyListsView(api);

    const before = view.getChildren();
    account = 'someone';
    view.refresh();
    const after = view.getChildren();
    held.open();

    const names = async (nodes: Promise<unknown[]>) =>
      (await nodes).map((node) => (node as { list?: { name: string } }).list?.name);
    expect(await names(after)).toEqual(["someone's list"]);
    // The caller from before the refresh ends up with the fresh answer too.
    expect(await names(before)).toEqual(["someone's list"]);
  });
});
