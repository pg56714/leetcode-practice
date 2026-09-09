import { log } from '../log';
import type { Api } from './api';
import {
  CONTEST_QUESTIONS,
  FAVOURITE_LISTS,
  FAVOURITE_QUESTIONS,
  PAST_CONTESTS,
  STUDY_PLAN_DETAIL,
  UPCOMING_CONTESTS,
} from './queries';
import type { Difficulty, ProblemSummary } from './types';

/**
 * Study plans the view offers out of the box.
 *
 * LeetCode has no working query for "list the study plans" — the one that looks
 * like it (`studyPlansV2ByCatalog`) answers zero for every catalog slug tried,
 * and introspection is disabled, so there is nothing to enumerate with. Each of
 * these was checked individually against `studyPlanV2Detail`. The setting exists
 * because this list cannot discover new plans on its own.
 *
 * Algorithm plans only. LeetCode also publishes SQL and JavaScript courses,
 * which are worth doing and are not what this workspace is for — add their
 * slugs to the setting to bring them back.
 */
export const DEFAULT_STUDY_PLANS = [
  'top-interview-150',
  'leetcode-75',
  'top-100-liked',
  'programming-skills',
  'dynamic-programming',
  'graph-theory',
  'binary-search',
];

export interface StudyPlanGroup {
  name: string;
  questions: ProblemSummary[];
}

export interface StudyPlan {
  slug: string;
  name: string;
  total: number;
  groups: StudyPlanGroup[];
}

export interface Contest {
  slug: string;
  title: string;
  /** Unix seconds, as LeetCode sends it. */
  startTime: number;
  durationMinutes: number;
  /** Past contests can be practised; upcoming ones have no problems yet. */
  past: boolean;
}

/** A problem as a contest lists it. */
export interface ContestQuestion {
  title: string;
  slug: string;
  /** Points it was worth, which is the contest's own difficulty scale. */
  credit: number;
}

/** Raw question node inside a study plan. */
interface PlanQuestionNode {
  questionFrontendId: string;
  title: string;
  titleSlug: string;
  /** Upper case here, unlike everywhere else in the schema. */
  difficulty: string;
  /** "TO_DO", "SOLVED" or "PAST_SOLVED" — not the list view's "ac"/"notac". */
  status: string | null;
  paidOnly: boolean;
}

/**
 * Brings a plan's difficulty in line with the rest of the schema.
 *
 * The problem set answers "Easy"; a study plan answers "EASY" for the same
 * problem. Normalising here means the icons need to know about only one form.
 */
function normaliseDifficulty(value: string): Difficulty {
  const lower = value.toLowerCase();
  if (lower === 'medium') {
    return 'Medium';
  }
  if (lower === 'hard') {
    return 'Hard';
  }
  return 'Easy';
}

/**
 * Brings a status in line with the problem set's vocabulary.
 *
 * Two vocabularies are in play for the same idea: the problem set answers null,
 * "ac" or "notac", while study plans answer "TO_DO" or "PAST_SOLVED". Lists have
 * not been seen carrying either, so both are handled and anything unrecognised
 * counts as attempted — showing a problem as started when it might not be is
 * the milder error.
 */
function normaliseStatus(value: string | null): string | null {
  if (value === null || value === 'TO_DO' || value === '') {
    return null;
  }
  if (value === 'ac' || value.includes('SOLVED')) {
    return 'ac';
  }
  return 'notac';
}

function toSummary(node: PlanQuestionNode): ProblemSummary {
  return {
    number: node.questionFrontendId,
    title: node.title,
    slug: node.titleSlug,
    difficulty: normaliseDifficulty(node.difficulty),
    paidOnly: node.paidOnly,
    status: normaliseStatus(node.status),
    acRate: null,
  };
}

/** Fetches one study plan with its groups and problems. */
export async function fetchStudyPlan(api: Api, slug: string): Promise<StudyPlan> {
  const data = await api.graphql<{
    studyPlanV2Detail: {
      slug: string;
      name: string;
      questionNum: number;
      planSubGroups: { name: string; questions: PlanQuestionNode[] }[];
    } | null;
  }>(STUDY_PLAN_DETAIL, { slug });

  const plan = data.studyPlanV2Detail;
  if (plan === null) {
    throw new Error(`LeetCode does not know a study plan called "${slug}"`);
  }

  return {
    slug: plan.slug,
    name: plan.name,
    total: plan.questionNum,
    groups: plan.planSubGroups.map((group) => ({
      name: group.name,
      questions: group.questions.map(toSummary),
    })),
  };
}

/**
 * Fetches the plans the reader has configured.
 *
 * One request per plan, because a listing query does not exist. Failures are
 * reported and skipped rather than fatal: a slug typed into settings that
 * LeetCode does not recognise should cost that one row, not the whole view.
 */
export async function fetchStudyPlans(api: Api, slugs: string[]): Promise<StudyPlan[]> {
  const settled = await Promise.allSettled(slugs.map((slug) => fetchStudyPlan(api, slug)));
  const plans: StudyPlan[] = [];

  for (const [index, outcome] of settled.entries()) {
    if (outcome.status === 'fulfilled') {
      plans.push(outcome.value);
    } else {
      log.error(`Could not load study plan "${slugs[index]}"`, outcome.reason);
    }
  }
  return plans;
}

/** Fetches the contests that have not started yet. */
export async function fetchUpcomingContests(api: Api): Promise<Contest[]> {
  const data = await api.graphql<{
    upcomingContests: { title: string; titleSlug: string; startTime: number; duration: number }[];
  }>(UPCOMING_CONTESTS);

  return (data.upcomingContests ?? []).map((contest) => ({
    slug: contest.titleSlug,
    title: contest.title,
    startTime: contest.startTime,
    durationMinutes: Math.round(contest.duration / 60),
    past: false,
  }));
}

/**
 * Fetches the most recent contests that have already run.
 *
 * These are the ones worth showing: their problems exist and can be practised,
 * where an upcoming contest is only an announcement.
 */
export async function fetchPastContests(api: Api, count: number): Promise<Contest[]> {
  const data = await api.graphql<{
    pastContests: {
      data: { title: string; titleSlug: string; startTime: number; duration: number }[];
    } | null;
  }>(PAST_CONTESTS, { pageNo: 1, numPerPage: count });

  return (data.pastContests?.data ?? []).map((contest) => ({
    slug: contest.titleSlug,
    title: contest.title,
    startTime: contest.startTime,
    durationMinutes: Math.round(contest.duration / 60),
    past: true,
  }));
}

/** Fetches the problems that made up one contest. */
export async function fetchContestQuestions(api: Api, slug: string): Promise<ContestQuestion[]> {
  const data = await api.graphql<{
    contest: { questions: { title: string; titleSlug: string; credit: number }[] | null } | null;
  }>(CONTEST_QUESTIONS, { slug });

  return (data.contest?.questions ?? []).map((question) => ({
    title: question.title,
    slug: question.titleSlug,
    credit: question.credit,
  }));
}

/** One of the reader's own problem lists. */
export interface FavouriteList {
  slug: string;
  name: string;
  /** How many problems LeetCode says it holds. */
  count: number;
  /** Whether they made the list or saved somebody else's. */
  own: boolean;
}

/** Fetches the reader's created and collected lists. */
export async function fetchFavouriteLists(api: Api): Promise<FavouriteList[]> {
  const data = await api.graphql<{
    myCreatedFavoriteList: {
      favorites: { name: string; slug: string; questionNumber: number }[];
    } | null;
    myCollectedFavoriteList: {
      favorites: { name: string; slug: string; questionNumber: number }[];
    } | null;
  }>(FAVOURITE_LISTS);

  const created = data.myCreatedFavoriteList?.favorites ?? [];
  const collected = data.myCollectedFavoriteList?.favorites ?? [];

  return [
    ...created.map((list) => ({
      slug: list.slug,
      name: list.name,
      count: list.questionNumber,
      own: true,
    })),
    ...collected.map((list) => ({
      slug: list.slug,
      name: list.name,
      count: list.questionNumber,
      own: false,
    })),
  ];
}

/** How many problems one page of a list holds. */
const LIST_PAGE_SIZE = 100;

/**
 * Fetches every problem in one list.
 *
 * Paged with `hasMore` rather than a count, and capped: a list nobody expected
 * to be enormous should not turn into an unbounded loop.
 */
export async function fetchFavouriteQuestions(api: Api, slug: string): Promise<ProblemSummary[]> {
  const collected: ProblemSummary[] = [];

  for (let skip = 0; skip < 2000; skip += LIST_PAGE_SIZE) {
    const data = await api.graphql<{
      favoriteQuestionList: { hasMore: boolean; questions: PlanQuestionNode[] } | null;
    }>(FAVOURITE_QUESTIONS, { favoriteSlug: slug, limit: LIST_PAGE_SIZE, skip });

    const page = data.favoriteQuestionList;
    if (page === null) {
      break;
    }
    collected.push(...page.questions.map(toSummary));
    if (!page.hasMore) {
      break;
    }
  }
  return collected;
}
