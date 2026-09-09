import { describe, expect, test } from 'bun:test';
import type { Api } from '../leetcode/api';
import { fetchStudyPlan, fetchUpcomingContests } from '../leetcode/lists';

/** An Api that answers with whatever a test hands it. */
function apiReturning(data: unknown): Api {
  return { graphql: async () => data } as unknown as Api;
}

/**
 * Study plans answer in their own vocabulary: difficulty upper case, status as
 * TO_DO or PAST_SOLVED rather than null or "ac", and paidOnly rather than
 * isPaidOnly. Normalising at this boundary is what lets the icons know about
 * one form only, so it is worth pinning down.
 */
describe('fetchStudyPlan', () => {
  const plan = {
    studyPlanV2Detail: {
      slug: 'top-100-liked',
      name: 'Top 100 Liked',
      questionNum: 3,
      planSubGroups: [
        {
          name: 'Hash Table',
          questions: [
            {
              questionFrontendId: '1',
              title: 'Two Sum',
              titleSlug: 'two-sum',
              difficulty: 'EASY',
              status: 'PAST_SOLVED',
              paidOnly: false,
            },
            {
              questionFrontendId: '49',
              title: 'Group Anagrams',
              titleSlug: 'group-anagrams',
              difficulty: 'MEDIUM',
              status: 'TO_DO',
              paidOnly: false,
            },
            {
              questionFrontendId: '4',
              title: 'Median of Two Sorted Arrays',
              titleSlug: 'median-of-two-sorted-arrays',
              difficulty: 'HARD',
              status: null,
              paidOnly: true,
            },
          ],
        },
      ],
    },
  };

  test('brings difficulty back in line with the rest of the schema', async () => {
    const result = await fetchStudyPlan(apiReturning(plan), 'top-100-liked');
    const difficulties = result.groups[0]?.questions.map((question) => question.difficulty);
    expect(difficulties).toEqual(['Easy', 'Medium', 'Hard']);
  });

  test('reads PAST_SOLVED as solved and TO_DO as untouched', async () => {
    const result = await fetchStudyPlan(apiReturning(plan), 'top-100-liked');
    const statuses = result.groups[0]?.questions.map((question) => question.status);
    expect(statuses).toEqual(['ac', null, null]);
  });

  test('keeps the premium flag, which is spelt differently here', async () => {
    const result = await fetchStudyPlan(apiReturning(plan), 'top-100-liked');
    expect(result.groups[0]?.questions.map((question) => question.paidOnly)).toEqual([
      false,
      false,
      true,
    ]);
  });

  test('says which plan is missing rather than failing vaguely', async () => {
    const api = apiReturning({ studyPlanV2Detail: null });
    expect(fetchStudyPlan(api, 'no-such-plan')).rejects.toThrow('no-such-plan');
  });
});

describe('fetchUpcomingContests', () => {
  test('turns seconds into minutes and marks them as not yet run', async () => {
    const api = apiReturning({
      upcomingContests: [
        {
          title: 'Weekly Contest 519',
          titleSlug: 'weekly-contest-519',
          startTime: 1_788_000_000,
          duration: 5400,
        },
      ],
    });

    const [contest] = await fetchUpcomingContests(api);
    expect(contest?.durationMinutes).toBe(90);
    expect(contest?.past).toBe(false);
  });

  test('an empty announcement list is not an error', async () => {
    expect(await fetchUpcomingContests(apiReturning({ upcomingContests: [] }))).toEqual([]);
  });
});
