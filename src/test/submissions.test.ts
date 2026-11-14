import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import * as vscode from 'vscode';
import type { Api } from '../leetcode/api';
import { Catalogue } from '../leetcode/catalogue';
import { wait } from '../leetcode/http';
import type { ProblemSummary } from '../leetcode/types';
import { StudyListsView } from '../views/studyLists';
import { memoryFs } from './memoryFs';

function summary(number: number, slug: string): ProblemSummary {
  return {
    number: String(number),
    title: slug,
    slug,
    difficulty: 'Easy',
    paidOnly: false,
    status: null,
    acRate: null,
  };
}

/**
 * Solved marks after a submission.
 *
 * The sidebar learns solved state from LeetCode's listings, which the problem
 * set refetches once a week. Without updating in place, a problem stayed
 * hollow after an Accepted, which reads as a submission that failed.
 */
describe('Catalogue.recordSubmission', () => {
  let fs: ReturnType<typeof memoryFs>;
  let catalogue: Catalogue;
  beforeEach(async () => {
    fs = memoryFs();
    const problems = [summary(1, 'two-sum'), summary(2, 'add-two-numbers')];
    const api = { problemPage: async () => ({ total: problems.length, problems }) };
    catalogue = new Catalogue(api as unknown as Api, vscode.Uri.file('/storage'));
    await catalogue.refresh({ silent: true });
  });
  afterEach(() => fs.restore());

  test('marks the problem solved at once, and redraws', () => {
    let changes = 0;
    catalogue.onDidChange(() => changes++);

    catalogue.recordSubmission('add-two-numbers', true);

    expect(catalogue.search('2')[0]?.status).toBe('ac');
    expect(changes).toBe(1);
  });

  test('keeps the mark in the cache, so a reload does not lose it', async () => {
    catalogue.recordSubmission('add-two-numbers', true);
    await wait(5);

    const cached = JSON.parse(fs.read('/storage/problems.json') ?? '{}') as {
      problems: ProblemSummary[];
    };
    expect(cached.problems.find((problem) => problem.slug === 'add-two-numbers')?.status).toBe(
      'ac',
    );
  });

  test('a rejected submission marks an untouched problem as attempted', () => {
    catalogue.recordSubmission('two-sum', false);
    expect(catalogue.search('1')[0]?.status).toBe('notac');
  });

  test('leaves alone a problem it does not hold', () => {
    let changes = 0;
    catalogue.onDidChange(() => changes++);
    catalogue.recordSubmission('not-in-the-set', true);
    expect(changes).toBe(0);
  });
});

describe('StudyListsView.recordSubmission', () => {
  test('marks the problem inside the plans that hold it', async () => {
    const config = spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: () => ['top-100-liked'],
    } as unknown as vscode.WorkspaceConfiguration);
    try {
      const plan = {
        studyPlanV2Detail: {
          slug: 'top-100-liked',
          name: 'Top 100 Liked',
          questionNum: 1,
          planSubGroups: [
            {
              name: 'Hashing',
              questions: [
                {
                  questionFrontendId: '1',
                  title: 'Two Sum',
                  titleSlug: 'two-sum',
                  difficulty: 'EASY',
                  status: 'TO_DO',
                  paidOnly: false,
                },
              ],
            },
          ],
        },
      };
      const api = {
        graphql: async (document: string) =>
          document.includes('studyPlanV2Detail')
            ? plan
            : { myCreatedFavoriteList: { favorites: [] }, myCollectedFavoriteList: null },
      } as unknown as Api;
      const view = new StudyListsView(api);
      await view.getChildren();

      view.recordSubmission('two-sum', true);

      const [planNode] = await view.getChildren();
      const [groupNode] = planNode === undefined ? [] : await view.getChildren(planNode);
      const [problemNode] = groupNode === undefined ? [] : await view.getChildren(groupNode);
      expect((problemNode as { problem?: ProblemSummary } | undefined)?.problem?.status).toBe('ac');
    } finally {
      config.mockRestore();
    }
  });
});
