import * as vscode from 'vscode';
import type { Api } from '../leetcode/api';
import {
  DEFAULT_STUDY_PLANS,
  fetchStudyPlans,
  type StudyPlan,
  type StudyPlanGroup,
} from '../leetcode/lists';
import type { ProblemSummary } from '../leetcode/types';
import { log } from '../log';
import { problemIcon } from '../ui/icons';

/** A row in the tree: a plan, one of its groups, or a problem. */
type Node =
  | { kind: 'plan'; plan: StudyPlan }
  | { kind: 'group'; plan: StudyPlan; group: StudyPlanGroup }
  | { kind: 'problem'; problem: ProblemSummary }
  | { kind: 'message'; text: string };

/** The plans to show, from settings, falling back to the built-in list. */
function configuredPlans(): string[] {
  const configured = vscode.workspace
    .getConfiguration('leetcodePractice')
    .get<string[]>('studyPlans');

  if (Array.isArray(configured) && configured.length > 0) {
    return configured.filter((slug) => typeof slug === 'string' && slug.trim() !== '');
  }
  return DEFAULT_STUDY_PLANS;
}

/**
 * Study plans, as plan then group then problem.
 *
 * Each plan costs a request because LeetCode has no listing query, so they are
 * fetched once when the view first asks and then kept for the session. That
 * also means the whole tree is in memory: expanding a group is free.
 */
export class StudyPlansView implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  private plans: StudyPlan[] | undefined;
  private loading: Promise<void> | undefined;
  private failure: string | undefined;

  constructor(private readonly api: Api) {}

  /** Discards what was loaded so the next read refetches. */
  refresh(): void {
    this.plans = undefined;
    this.failure = undefined;
    this.changed.fire();
  }

  private async load(): Promise<void> {
    const slugs = configuredPlans();
    try {
      this.plans = await fetchStudyPlans(this.api, slugs);
      if (this.plans.length === 0) {
        this.failure = 'No study plans could be loaded.';
      }
      log.info(`Loaded ${this.plans.length} of ${slugs.length} study plans`);
    } catch (err) {
      log.error('Could not load study plans', err);
      this.failure = err instanceof Error ? err.message : String(err);
      this.plans = [];
    }
    this.changed.fire();
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'message') {
      const item = new vscode.TreeItem(node.text);
      item.iconPath = new vscode.ThemeIcon('info');
      return item;
    }

    if (node.kind === 'plan') {
      const solved = node.plan.groups
        .flatMap((group) => group.questions)
        .filter((question) => question.status === 'ac').length;

      const item = new vscode.TreeItem(node.plan.name, vscode.TreeItemCollapsibleState.Collapsed);
      item.description = `${solved} / ${node.plan.total}`;
      item.tooltip = node.plan.slug;
      item.iconPath = new vscode.ThemeIcon(
        solved === node.plan.total ? 'pass-filled' : 'checklist',
      );
      return item;
    }

    if (node.kind === 'group') {
      const item = new vscode.TreeItem(node.group.name, vscode.TreeItemCollapsibleState.Collapsed);
      item.description = `${node.group.questions.length}`;
      return item;
    }

    const item = new vscode.TreeItem(`${node.problem.number}. ${node.problem.title}`);
    item.description = node.problem.difficulty;
    item.iconPath = problemIcon(node.problem);
    item.tooltip = node.problem.paidOnly ? `${node.problem.title} (Premium only)` : undefined;
    item.command = {
      command: 'leetcodePractice.openProblem',
      title: 'Open problem',
      arguments: [node.problem.slug],
    };
    return item;
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (node === undefined) {
      if (this.plans === undefined) {
        // Shared so that a refresh landing mid-fetch does not start a second one.
        this.loading ??= this.load().finally(() => {
          this.loading = undefined;
        });
        await this.loading;
      }
      if (this.failure !== undefined) {
        return [{ kind: 'message', text: this.failure }];
      }
      return (this.plans ?? []).map((plan) => ({ kind: 'plan', plan }));
    }

    if (node.kind === 'plan') {
      return node.plan.groups.map((group) => ({ kind: 'group', plan: node.plan, group }));
    }
    if (node.kind === 'group') {
      return node.group.questions.map((problem) => ({ kind: 'problem', problem }));
    }
    return [];
  }

  dispose(): void {
    this.changed.dispose();
  }
}
