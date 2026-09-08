import * as vscode from 'vscode';
import type { Api } from '../leetcode/api';
import { type Contest, fetchUpcomingContests } from '../leetcode/lists';
import { log } from '../log';

/** Reads as "in 3 days" or "in 4 hours", whichever is the coarser truth. */
function startsIn(startTime: number): string {
  const seconds = startTime - Math.floor(Date.now() / 1000);
  if (seconds <= 0) {
    return 'under way';
  }
  const hours = Math.round(seconds / 3600);
  if (hours < 24) {
    return `in ${hours} h`;
  }
  return `in ${Math.round(hours / 24)} d`;
}

/**
 * Upcoming contests.
 *
 * Rows open the contest page in a browser rather than in the editor: a
 * contest's problems do not exist in the API until it starts, and taking part
 * means the scoreboard and the timer, which live on the website.
 */
export class ContestsView implements vscode.TreeDataProvider<Contest | { message: string }> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  private contests: Contest[] | undefined;
  private failure: string | undefined;
  private loading: Promise<void> | undefined;

  constructor(private readonly api: Api) {}

  refresh(): void {
    this.contests = undefined;
    this.failure = undefined;
    this.changed.fire();
  }

  private async load(): Promise<void> {
    try {
      this.contests = await fetchUpcomingContests(this.api);
      log.info(`Loaded ${this.contests.length} upcoming contests`);
    } catch (err) {
      log.error('Could not load contests', err);
      this.failure = err instanceof Error ? err.message : String(err);
      this.contests = [];
    }
    this.changed.fire();
  }

  getTreeItem(node: Contest | { message: string }): vscode.TreeItem {
    if ('message' in node) {
      const item = new vscode.TreeItem(node.message);
      item.iconPath = new vscode.ThemeIcon('info');
      return item;
    }

    const item = new vscode.TreeItem(node.title);
    item.description = `${startsIn(node.startTime)} · ${node.durationMinutes} min`;
    item.tooltip = new Date(node.startTime * 1000).toLocaleString();
    item.iconPath = new vscode.ThemeIcon('watch');
    item.command = {
      command: 'vscode.open',
      title: 'Open contest',
      arguments: [vscode.Uri.parse(`https://leetcode.com/contest/${node.slug}/`)],
    };
    return item;
  }

  async getChildren(
    node?: Contest | { message: string },
  ): Promise<(Contest | { message: string })[]> {
    if (node !== undefined) {
      return [];
    }
    if (this.contests === undefined) {
      this.loading ??= this.load().finally(() => {
        this.loading = undefined;
      });
      await this.loading;
    }
    if (this.failure !== undefined) {
      return [{ message: this.failure }];
    }
    if ((this.contests ?? []).length === 0) {
      return [{ message: 'No contests announced yet.' }];
    }
    return this.contests ?? [];
  }

  dispose(): void {
    this.changed.dispose();
  }
}
