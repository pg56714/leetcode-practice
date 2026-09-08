/** Credentials copied out of a signed-in browser session. */
export interface Credentials {
  session: string;
  csrfToken: string;
}

export interface UserStatus {
  signedIn: boolean;
  username: string;
  premium: boolean;
}

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

/** A problem as it appears in listings — enough to render a row, no body. */
export interface ProblemSummary {
  /** The number shown on the website, e.g. "3028". Not LeetCode's internal id. */
  number: string;
  title: string;
  slug: string;
  difficulty: Difficulty;
  paidOnly: boolean;
  /** "ac" once solved, "notac" when attempted but failing, null when untouched. */
  status: string | null;
  /** Acceptance rate as a percentage. Null for queries that do not ask for it. */
  acRate: number | null;
}

export interface DailyChallenge {
  date: string;
  problem: ProblemSummary;
}

export interface CodeSnippet {
  /** Human label, e.g. "Python3". */
  lang: string;
  /** Slug the submit API expects, e.g. "python3". */
  langSlug: string;
  code: string;
}

/** A single problem, with everything needed to start solving it. */
export interface ProblemDetail {
  /** Internal database id. The submit and interpret endpoints want this one. */
  id: string;
  /** The number shown on the website. Use this for display and naming. */
  number: string;
  title: string;
  slug: string;
  difficulty: Difficulty;
  paidOnly: boolean;
  /** Problem statement as HTML, exactly as LeetCode serves it. */
  content: string;
  /** The first example, in the format the interpret endpoint accepts. */
  sampleTestCase: string;
  /** Every example, newline separated. */
  exampleTestcases: string;
  /** How many lines one test case occupies, derived from metaData.params. */
  linesPerCase: number;
  snippets: CodeSnippet[];
  tags: string[];
}
