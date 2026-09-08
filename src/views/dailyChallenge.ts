import * as vscode from 'vscode';
import { type Api, problemUrl } from '../leetcode/api';
import type { DailyChallenge } from '../leetcode/types';
import { log } from '../log';
import { problemIcon } from '../ui/icons';

/**
 * The Daily Challenge view.
 *
 * One row, refetched on demand. Errors surface as a row rather than a popup:
 * a tree that silently empties itself looks like a bug, and a modal for "the
 * network blipped" is worse than a line of text in the view.
 */
export class DailyChallengeView implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  private state:
    | { kind: 'loading' }
    | { kind: 'ready'; daily: DailyChallenge }
    | { kind: 'failed'; reason: string } = {
    kind: 'loading',
  };

  constructor(private readonly api: Api) {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.state = { kind: 'loading' };
    this.changed.fire();
    try {
      this.state = { kind: 'ready', daily: await this.api.dailyChallenge() };
    } catch (err) {
      log.error('Could not load the daily challenge', err);
      this.state = { kind: 'failed', reason: err instanceof Error ? err.message : String(err) };
    }
    this.changed.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (element !== undefined) {
      return [];
    }

    if (this.state.kind === 'loading') {
      return [new vscode.TreeItem('Loading…')];
    }

    if (this.state.kind === 'failed') {
      const item = new vscode.TreeItem(this.state.reason);
      item.iconPath = new vscode.ThemeIcon('warning');
      item.command = { command: 'leetcodePractice.showOutput', title: 'Show Output' };
      return [item];
    }

    const { date, problem } = this.state.daily;
    const item = new vscode.TreeItem(`${problem.number}. ${problem.title}`);
    item.description = `${problem.difficulty} · ${date}`;
    item.iconPath = problemIcon(problem);
    item.tooltip = problem.paidOnly ? 'Premium only' : problem.title;
    // Phase 3 replaces this with "open the problem in the editor".
    item.command = {
      command: 'vscode.open',
      title: 'Open on LeetCode',
      arguments: [vscode.Uri.parse(problemUrl(problem.slug))],
    };
    return [item];
  }

  dispose(): void {
    this.changed.dispose();
  }
}
