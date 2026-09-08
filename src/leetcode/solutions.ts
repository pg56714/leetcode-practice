import type { Api } from './api';
import { SOLUTION_ARTICLE, SOLUTION_LIST } from './queries';

/** One community solution, as it appears in a listing. */
export interface SolutionSummary {
  id: string;
  title: string;
  author: string;
  votes: number;
  comments: number;
  views: number;
  /** Unix seconds. */
  createdAt: number;
}

/** One community solution with its body. */
export interface SolutionArticle extends SolutionSummary {
  /** Markdown, with the escaping already undone. */
  content: string;
}

const NEWLINE = String.fromCharCode(10);
const TAB = String.fromCharCode(9);
const BACKSLASH = String.fromCharCode(92);

/**
 * Undoes the escaping LeetCode applies to post bodies.
 *
 * Post content arrives with its newlines as the two characters backslash and n
 * rather than as newlines, and its backslashes doubled — a 7,888 character post
 * came back with 205 of the former and not one real line break. Rendering it
 * untouched produces one enormous line.
 *
 * `JSON.parse` looks like the obvious way to undo it and is not: the bodies
 * contain sequences it rejects, such as a backslash before a full stop inside a
 * regex. So the replacements are done explicitly, longest first, so that a
 * doubled backslash is consumed before it can be read as the start of an
 * escape.
 */
export function unescapePost(content: string): string {
  const placeholder = String.fromCharCode(0);

  return content
    .split(BACKSLASH + BACKSLASH)
    .join(placeholder)
    .split(BACKSLASH + 'n')
    .join(NEWLINE)
    .split(BACKSLASH + 'r')
    .join('')
    .split(BACKSLASH + 't')
    .join(TAB)
    .split(BACKSLASH + '"')
    .join('"')
    .split(placeholder)
    .join(BACKSLASH);
}

interface SolutionNode {
  id: string;
  title: string;
  commentCount: number | null;
  viewCount: number | null;
  post: {
    voteCount: number | null;
    creationDate: number | null;
    author: { username: string } | null;
  } | null;
}

function toSummary(node: SolutionNode): SolutionSummary {
  return {
    id: node.id,
    title: node.title,
    author: node.post?.author?.username ?? 'unknown',
    votes: node.post?.voteCount ?? 0,
    comments: node.commentCount ?? 0,
    views: node.viewCount ?? 0,
    createdAt: node.post?.creationDate ?? 0,
  };
}

/**
 * Fetches the most upvoted community solutions for a problem.
 *
 * Sorted by votes because that is the reason to read other people's solutions
 * at all: the top few are the ones that explain an approach rather than merely
 * pass. Note the sort option is a lower case enum literal, `most_votes`.
 */
export async function fetchSolutions(
  api: Api,
  slug: string,
  count: number,
): Promise<SolutionSummary[]> {
  const data = await api.graphql<{
    questionSolutions: { totalNum: number; solutions: SolutionNode[] } | null;
  }>(SOLUTION_LIST, { slug, first: count });

  return (data.questionSolutions?.solutions ?? []).map(toSummary);
}

/** Fetches one solution with its body. */
export async function fetchSolutionArticle(api: Api, id: string): Promise<SolutionArticle> {
  const data = await api.graphql<{
    topic: (SolutionNode & { post: { content: string } | null }) | null;
  }>(SOLUTION_ARTICLE, { id: Number(id) });

  const topic = data.topic;
  if (topic === null) {
    throw new Error(`Solution ${id} could not be loaded`);
  }

  return {
    ...toSummary(topic),
    content: unescapePost(topic.post?.content ?? ''),
  };
}
