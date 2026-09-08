import * as vscode from 'vscode';
import type { Api } from '../leetcode/api';
import {
  type Contest,
  type ContestQuestion,
  fetchContestQuestions,
  fetchPastContests,
  fetchUpcomingContests,
} from '../leetcode/lists';
import { log } from '../log';

/** How many finished contests to list. */
const PAST_COUNT = 12;

type Node =
  | { kind: 'contest'; contest: Contest }
  | { kind: 'question'; question: ContestQuestion }
  | { kind: 'message'; text: string };

/** Reads as "in 4 h" or "in 3 d", whichever is the coarser truth. */
function startsIn(startTime: number): string {
  const seconds = startTime - Math.floor(Date.now() / 1000);
  if (seconds <= 0) {
    return 'under way';
  }
  const hours = Math.round(seconds / 3600);
  return hours < 24 ? `in ${hours} h` : `in ${Math.round(hours / 24)} d`;
}

/**
 * Contests, upcoming first and then the ones that have run.
 *
 * The finished ones are the point of the view: their problems exist, so they
 * expand and each problem opens like any other. An upcoming contest has no
 * problems yet — nothing to expand, and its row opens the website, where the
 * timer and the scoreboard are.
 */
export class ContestsView implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  private contests: Contest[] | undefined;
  private readonly questions = new Map<string, ContestQuestion[]>();
  private loading: Promise<void> | undefined;
  private failure: string | undefined;

  constructor(private readonly api: Api) {}

  refresh(): void {
    this.contests = undefined;
    this.questions.clear();
    this.failure = undefined;
    this.changed.fire();
  }

  private async load(): Promise<void> {
    try {
      // One failing must not hide the other, and upcoming is the more likely to
      // be empty — there are stretches with nothing announced.
      const [upcoming, past] = await Promise.all([
        fetchUpcomingContests(this.api).catch((err: unknown) => {
          log.error('Could not load upcoming contests', err);
          return [] as Contest[];
        }),
        fetchPastContests(this.api, PAST_COUNT).catch((err: unknown) => {
          log.error('Could not load past contests', err);
          return [] as Contest[];
        }),
      ]);

      this.contests = [...upcoming, ...past];
      if (this.contests.length === 0) {
        this.failure = 'No contests could be loaded.';
      }
      log.info(`Loaded ${upcoming.length} upcoming and ${past.length} past contests`);
    } catch (err) {
      log.error('Could not load contests', err);
      this.failure = err instanceof Error ? err.message : String(err);
      this.contests = [];
    }
    this.changed.fire();
  }

  private async questionsFor(contest: Contest): Promise<ContestQuestion[]> {
    const cached = this.questions.get(contest.slug);
    if (cached !== undefined) {
      return cached;
    }
    try {
      const questions = await fetchContestQuestions(this.api, contest.slug);
      this.questions.set(contest.slug, questions);
      return questions;
    } catch (err) {
      log.error(`Could not load the problems in ${contest.slug}`, err);
      return [];
    }
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'message') {
      const item = new vscode.TreeItem(node.text);
      item.iconPath = new vscode.ThemeIcon('info');
      return item;
    }

    if (node.kind === 'question') {
      const item = new vscode.TreeItem(node.question.title);
      item.description = `${node.question.credit} pts`;
      item.iconPath = new vscode.ThemeIcon('circle-outline');
      item.command = {
        command: 'leetcodePractice.openProblem',
        title: 'Open problem',
        arguments: [node.question.slug],
      };
      return item;
    }

    const { contest } = node;
    const item = new vscode.TreeItem(
      contest.title,
      contest.past
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    const when = new Date(contest.startTime * 1000);

    if (contest.past) {
      item.description = when.toISOString().slice(0, 10);
      item.iconPath = new vscode.ThemeIcon('history');
      item.tooltip = `${when.toLocaleString()} · ${contest.durationMinutes} min`;
    } else {
      item.description = `${startsIn(contest.startTime)} · ${contest.durationMinutes} min`;
      item.iconPath = new vscode.ThemeIcon('watch');
      item.tooltip = when.toLocaleString();
      // Nothing to open in the editor until it has run.
      item.command = {
        command: 'vscode.open',
        title: 'Open contest',
        arguments: [vscode.Uri.parse(`https://leetcode.com/contest/${contest.slug}/`)],
      };
    }
    return item;
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (node === undefined) {
      if (this.contests === undefined) {
        this.loading ??= this.load().finally(() => {
          this.loading = undefined;
        });
        await this.loading;
      }
      if (this.failure !== undefined) {
        return [{ kind: 'message', text: this.failure }];
      }
      return (this.contests ?? []).map((contest) => ({ kind: 'contest', contest }));
    }

    if (node.kind === 'contest') {
      const questions = await this.questionsFor(node.contest);
      if (questions.length === 0) {
        return [{ kind: 'message', text: 'No problems listed for this contest.' }];
      }
      return questions.map((question) => ({ kind: 'question', question }));
    }
    return [];
  }

  dispose(): void {
    this.changed.dispose();
  }
}
