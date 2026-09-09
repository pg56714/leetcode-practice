import { log } from '../log';
import { DAILY_CHALLENGE, PROBLEM_PAGE, QUESTION_DETAIL, USER_STATUS } from './queries';
import type { Session } from './session';
import type {
  CodeSnippet,
  DailyChallenge,
  Difficulty,
  ProblemDetail,
  ProblemSummary,
  UserStatus,
} from './types';

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
interface ProblemPage {
  total: number;
  problems: ProblemSummary[];
}

/** Thrown when LeetCode answers, but with something other than data. */
class LeetCodeError extends Error {}

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
      headers.Cookie = `LEETCODE_SESSION=${credentials.session}; csrftoken=${credentials.csrfToken}`;
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

  /**
   * Fetches one problem in full.
   *
   * Premium problems answer with empty content and no snippets rather than an
   * error, so an unusable answer is turned into one here.
   */
  async questionDetail(slug: string): Promise<ProblemDetail> {
    const data = await this.graphql<{ question: DetailNode | null }>(QUESTION_DETAIL, {
      titleSlug: slug,
    });

    const node = data.question;
    if (node === null) {
      throw new LeetCodeError(`LeetCode does not know a problem called "${slug}"`);
    }
    if (node.codeSnippets === null || node.codeSnippets.length === 0) {
      throw new LeetCodeError(
        node.isPaidOnly
          ? `"${node.title}" is a Premium problem, so its code templates are not available`
          : `"${node.title}" came back without any code templates`,
      );
    }

    return {
      id: node.questionId,
      number: node.questionFrontendId,
      title: node.title,
      slug: node.titleSlug,
      difficulty: node.difficulty,
      paidOnly: node.isPaidOnly,
      content: node.content ?? '',
      sampleTestCase: node.sampleTestCase ?? '',
      exampleTestcases: node.exampleTestcases ?? node.sampleTestCase ?? '',
      linesPerCase: linesPerCase(node.metaData),
      snippets: node.codeSnippets,
      tags: (node.topicTags ?? []).map((tag) => tag.name),
    };
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

/** Raw node returned for a single problem. */
interface DetailNode {
  questionId: string;
  questionFrontendId: string;
  title: string;
  titleSlug: string;
  content: string | null;
  difficulty: Difficulty;
  isPaidOnly: boolean;
  sampleTestCase: string | null;
  exampleTestcases: string | null;
  metaData: string | null;
  codeSnippets: CodeSnippet[] | null;
  topicTags: { name: string; slug: string }[] | null;
}

/**
 * How many lines one test case occupies.
 *
 * Every argument to the solution is passed on its own line, so the length of
 * metaData.params is the answer. Verified against two-sum (2 params, 2 lines),
 * ant-on-the-boundary (1 param, 1 line) and lru-cache (2 params, 2 lines, even
 * though it is a class-design problem). Anything unparseable falls back to one
 * line, which is what a single-argument problem needs.
 */
function linesPerCase(metaData: string | null): number {
  if (metaData === null) {
    return 1;
  }
  try {
    const parsed = JSON.parse(metaData) as { params?: unknown[] };
    return Array.isArray(parsed.params) && parsed.params.length > 0 ? parsed.params.length : 1;
  } catch {
    return 1;
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
