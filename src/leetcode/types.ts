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
