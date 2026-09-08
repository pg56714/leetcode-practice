import * as vscode from 'vscode';
import type { Api } from '../leetcode/api';
import {
  DEFAULT_STUDY_PLANS,
  type FavouriteList,
  fetchFavouriteLists,
  fetchFavouriteQuestions,
  fetchStudyPlans,
  type StudyPlan,
  type StudyPlanGroup,
} from '../leetcode/lists';
import type { ProblemSummary } from '../leetcode/types';
import { log } from '../log';
import { problemIcon } from '../ui/icons';

/** A row: one of the reader's lists, an official plan, a section, or a problem. */
type Node =
  | { kind: 'list'; list: FavouriteList }
  | { kind: 'plan'; plan: StudyPlan }
  | { kind: 'group'; group: StudyPlanGroup }
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
 * The reader's own lists and LeetCode's official plans, in one tree.
 *
 * Both belong here because neither is sufficient alone: the lists are personal
 * but only exist once somebody makes them, and the plans are ready-made but
 * cannot be discovered — LeetCode has no query that enumerates them, so they
 * are named in settings. Lists hold problems directly; a plan holds sections.
 *
 * Everything is fetched once and kept for the session, so expanding is free.
 * A list's problems are fetched when it is first expanded, since a list nobody
 * opens should not cost a request.
 */
export class StudyListsView implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  private lists: FavouriteList[] | undefined;
  private plans: StudyPlan[] | undefined;
  private readonly listQuestions = new Map<string, ProblemSummary[]>();
  private loading: Promise<void> | undefined;
  private failure: string | undefined;

  constructor(private readonly api: Api) {}

  /** Discards everything loaded so the next read refetches. */
  refresh(): void {
    this.lists = undefined;
    this.plans = undefined;
    this.listQuestions.clear();
    this.failure = undefined;
    this.changed.fire();
  }

  private async load(): Promise<void> {
    const slugs = configuredPlans();
    try {
      // The reader's lists need a session; the plans do not. Settled rather
      // than all, so being signed out still shows the plans.
      const [lists, plans] = await Promise.all([
        fetchFavouriteLists(this.api).catch((err: unknown) => {
          log.error('Could not load your lists', err);
          return [] as FavouriteList[];
        }),
        fetchStudyPlans(this.api, slugs),
      ]);

      this.lists = lists;
      this.plans = plans;
      if (lists.length === 0 && plans.length === 0) {
        this.failure = 'Nothing could be loaded. Sign in, or check the study plan slugs.';
      }
      log.info(`Loaded ${lists.length} lists and ${plans.length} of ${slugs.length} study plans`);
    } catch (err) {
      log.error('Could not load study lists', err);
      this.failure = err instanceof Error ? err.message : String(err);
      this.lists = [];
      this.plans = [];
    }
    this.changed.fire();
  }

  private async questionsFor(list: FavouriteList): Promise<ProblemSummary[]> {
    const cached = this.listQuestions.get(list.slug);
    if (cached !== undefined) {
      return cached;
    }
    try {
      const questions = await fetchFavouriteQuestions(this.api, list.slug);
      this.listQuestions.set(list.slug, questions);
      return questions;
    } catch (err) {
      log.error(`Could not load the problems in "${list.name}"`, err);
      return [];
    }
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'message') {
      const item = new vscode.TreeItem(node.text);
      item.iconPath = new vscode.ThemeIcon('info');
      return item;
    }

    if (node.kind === 'list') {
      const state =
        node.list.count === 0
          ? vscode.TreeItemCollapsibleState.None
          : vscode.TreeItemCollapsibleState.Collapsed;
      const item = new vscode.TreeItem(node.list.name, state);
      item.description = `${node.list.count}`;
      item.tooltip = node.list.own ? 'A list you made' : 'A list you saved';
      item.iconPath = new vscode.ThemeIcon(node.list.own ? 'star' : 'star-full');
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
      if (this.lists === undefined || this.plans === undefined) {
        // Shared so a refresh landing mid-fetch does not start a second one.
        this.loading ??= this.load().finally(() => {
          this.loading = undefined;
        });
        await this.loading;
      }
      if (this.failure !== undefined) {
        return [{ kind: 'message', text: this.failure }];
      }
      return [
        ...(this.lists ?? []).map((list): Node => ({ kind: 'list', list })),
        ...(this.plans ?? []).map((plan): Node => ({ kind: 'plan', plan })),
      ];
    }

    if (node.kind === 'list') {
      const questions = await this.questionsFor(node.list);
      if (questions.length === 0) {
        return [{ kind: 'message', text: 'This list is empty.' }];
      }
      return questions.map((problem) => ({ kind: 'problem', problem }));
    }
    if (node.kind === 'plan') {
      return node.plan.groups.map((group) => ({ kind: 'group', group }));
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
