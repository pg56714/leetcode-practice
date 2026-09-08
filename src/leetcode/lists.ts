import { log } from '../log';
import type { Api } from './api';
import { STUDY_PLAN_DETAIL, UPCOMING_CONTESTS } from './queries';
import type { Difficulty, ProblemSummary } from './types';

/**
 * Study plans the view offers out of the box.
 *
 * LeetCode has no working query for "list the study plans" — the one that looks
 * like it (`studyPlansV2ByCatalog`) answers zero for every catalog slug tried,
 * and introspection is disabled, so there is nothing to enumerate with. Each of
 * these was checked individually against `studyPlanV2Detail`. The setting exists
 * because this list cannot discover new plans on its own.
 */
export const DEFAULT_STUDY_PLANS = [
  'top-interview-150',
  'leetcode-75',
  'top-100-liked',
  'top-sql-50',
  'programming-skills',
  'dynamic-programming',
  'graph-theory',
  'binary-search',
  '30-days-of-javascript',
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
 * Brings a plan's status in line with the problem set's.
 *
 * A plan reports "TO_DO" or "PAST_SOLVED" where the problem set reports null or
 * "ac". Anything else that is not TO_DO is treated as attempted, so an
 * unfamiliar value shows as started rather than untouched.
 */
function normaliseStatus(value: string | null): string | null {
  if (value === null || value === 'TO_DO') {
    return null;
  }
  return value.includes('SOLVED') ? 'ac' : 'notac';
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
  }));
}
