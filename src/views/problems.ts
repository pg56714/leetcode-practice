import * as vscode from 'vscode';
import { Catalogue } from '../leetcode/catalogue';
import { problemUrl } from '../leetcode/api';
import { ProblemSummary } from '../leetcode/types';

const DIFFICULTY_ICON: Record<string, string> = {
  Easy: 'circle-outline',
  Medium: 'circle-large-outline',
  Hard: 'flame',
};

/** How many rows are rendered at once when nothing is being searched. */
const UNFILTERED_LIMIT = 500;

/**
 * The Problems view: the whole problem set, filtered by a search term.
 *
 * Unfiltered it renders only the first slice — 4,000-plus rows is not something
 * anyone scrolls through, and the search box is the real way in. The row count
 * and cache age go in the view's message so that stays visible.
 */
export class ProblemsView implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  private query = '';
  private view: vscode.TreeView<vscode.TreeItem> | undefined;

  constructor(private readonly catalogue: Catalogue) {
    this.catalogue.onDidChange(() => this.render());
  }

  /** Lets the view own its own message line once the tree exists. */
  attach(view: vscode.TreeView<vscode.TreeItem>): void {
    this.view = view;
    this.render();
  }

  async promptForSearch(): Promise<void> {
    const entered = await vscode.window.showInputBox({
      title: 'Search problems',
      prompt: 'Problem number or words from the title',
      value: this.query,
      placeHolder: 'e.g. 3028, two sum, anagram',
    });
    if (entered === undefined) {
      return;
    }
    await this.setQuery(entered);
  }

  async clearSearch(): Promise<void> {
    await this.setQuery('');
  }

  private async setQuery(query: string): Promise<void> {
    this.query = query;
    await vscode.commands.executeCommand(
      'setContext',
      'leetcodePractice.problemsFiltered',
      query.trim() !== '',
    );
    this.render();
  }

  private render(): void {
    if (this.view) {
      this.view.message = this.describe();
    }
    this.changed.fire();
  }

  private describe(): string {
    if (this.catalogue.size === 0) {
      return 'No problems cached yet — use Refresh.';
    }
    const age = this.catalogue.age;
    const when = age ? age.toISOString().slice(0, 10) : 'unknown';
    if (this.query.trim() !== '') {
      const hits = this.catalogue.search(this.query).length;
      return `${hits} match "${this.query}" of ${this.catalogue.size} problems`;
    }
    return `${this.catalogue.size} problems, updated ${when}`;
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (element !== undefined) {
      return [];
    }

    const matches = this.catalogue.search(this.query);
    if (matches.length === 0) {
      return [];
    }

    const filtering = this.query.trim() !== '';
    const shown = filtering ? matches : matches.slice(0, UNFILTERED_LIMIT);
    const rows = shown.map((problem) => toRow(problem));

    if (!filtering && matches.length > shown.length) {
      const more = new vscode.TreeItem(
        `… ${matches.length - shown.length} more — use Search`,
      );
      more.iconPath = new vscode.ThemeIcon('search');
      more.command = { command: 'leetcodePractice.searchProblems', title: 'Search problems' };
      rows.push(more);
    }
    return rows;
  }

  dispose(): void {
    this.changed.dispose();
  }
}

/** Renders one problem as a tree row. */
function toRow(problem: ProblemSummary): vscode.TreeItem {
  const item = new vscode.TreeItem(`${problem.number}. ${problem.title}`);
  const rate = problem.acRate === null ? '' : ` · ${problem.acRate.toFixed(0)}%`;
  item.description = `${problem.difficulty}${rate}`;
  item.iconPath = new vscode.ThemeIcon(
    problem.paidOnly ? 'lock' : problem.status === 'ac' ? 'check' : (DIFFICULTY_ICON[problem.difficulty] ?? 'circle-outline'),
  );
  item.tooltip = problem.paidOnly ? `${problem.title} (Premium only)` : problem.title;
  item.contextValue = 'leetcodeProblem';
  // Phase 3 replaces this with "open the problem in the editor".
  item.command = {
    command: 'vscode.open',
    title: 'Open on LeetCode',
    arguments: [vscode.Uri.parse(problemUrl(problem.slug))],
  };
  return item;
}
