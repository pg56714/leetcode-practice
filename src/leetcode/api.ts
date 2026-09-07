import { log } from '../log';
import { DAILY_CHALLENGE, PROBLEM_PAGE, USER_STATUS } from './queries';
import { DailyChallenge, Difficulty, ProblemSummary, UserStatus } from './types';
import { Session } from './session';

export const ORIGIN = 'https://leetcode.com';

/** LeetCode's hard ceiling on rows per problem-set page, whatever `limit` asks. */
export const PAGE_SIZE = 100;

/** Shape every GraphQL response shares. */
interface GraphQLReply<T> {
  data?: T;
  errors?: { message: string }[];
}

/** Raw question node as LeetCode returns it in listings. */
interface QuestionNode {
  questionFrontendId: string;
  title: string;
  titleSlug: string;
  difficulty: Difficulty;
  isPaidOnly: boolean;
  status: string | null;
  acRate?: number;
}

/** One page of the problem set. */
export interface ProblemPage {
  total: number;
  problems: ProblemSummary[];
}

/** Thrown when LeetCode answers, but with something other than data. */
export class LeetCodeError extends Error {}

export class Api {
  constructor(private readonly session: Session) {}

  /**
   * Runs one GraphQL document.
   *
   * Credentials are attached when present: most queries answer anonymously, but
   * the per-problem `status` field is only populated for a signed-in caller.
   */
  async graphql<T>(document: string, variables: Record<string, unknown> = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Referer: ORIGIN,
      Origin: ORIGIN,
    };

    const credentials = await this.session.read();
    if (credentials) {
      headers['Cookie'] = `LEETCODE_SESSION=${credentials.session}; csrftoken=${credentials.csrfToken}`;
      headers['x-csrftoken'] = credentials.csrfToken;
    }

    const response = await fetch(`${ORIGIN}/graphql/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: document, variables }),
    });

    if (!response.ok) {
      throw new LeetCodeError(`LeetCode replied with HTTP ${response.status}`);
    }

    const reply = (await response.json()) as GraphQLReply<T>;
    if (reply.errors?.length) {
      throw new LeetCodeError(reply.errors.map((e) => e.message).join('; '));
    }
    if (reply.data === undefined) {
      throw new LeetCodeError('LeetCode returned an empty response');
    }
    return reply.data;
  }

  async userStatus(): Promise<UserStatus> {
    // Signed out, LeetCode answers with isPremium: null and username: "".
    const data = await this.graphql<{
      userStatus: { isSignedIn: boolean; isPremium: boolean | null; username: string | null };
    }>(USER_STATUS);

    return {
      signedIn: data.userStatus.isSignedIn,
      username: data.userStatus.username ?? '',
      premium: data.userStatus.isPremium ?? false,
    };
  }

  /**
   * Fetches one page of the problem set.
   *
   * `total` comes back with every page, which is what lets a caller discover
   * how many pages exist without a separate count query.
   */
  async problemPage(skip: number): Promise<ProblemPage> {
    const data = await this.graphql<{
      problemsetQuestionList: { total: number; questions: QuestionNode[] };
    }>(PROBLEM_PAGE, { limit: PAGE_SIZE, skip });

    const page = data.problemsetQuestionList;
    return { total: page.total, problems: page.questions.map(toSummary) };
  }

  async dailyChallenge(): Promise<DailyChallenge> {
    const data = await this.graphql<{
      activeDailyCodingChallengeQuestion: { date: string; question: QuestionNode } | null;
    }>(DAILY_CHALLENGE);

    const active = data.activeDailyCodingChallengeQuestion;
    if (active === null) {
      throw new LeetCodeError('No daily challenge is published right now');
    }
    log.info(`Daily challenge for ${active.date}: ${active.question.titleSlug}`);
    return { date: active.date, problem: toSummary(active.question) };
  }
}

/** Narrows a raw question node down to what the UI renders. */
export function toSummary(node: QuestionNode): ProblemSummary {
  return {
    number: node.questionFrontendId,
    title: node.title,
    slug: node.titleSlug,
    difficulty: node.difficulty,
    paidOnly: node.isPaidOnly,
    status: node.status,
    acRate: node.acRate ?? null,
  };
}

/** The page a human would open for this problem. */
export function problemUrl(slug: string): string {
  return `${ORIGIN}/problems/${encodeURIComponent(slug)}/`;
}
