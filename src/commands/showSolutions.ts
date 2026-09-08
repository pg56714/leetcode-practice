import * as vscode from 'vscode';
import type { Api } from '../leetcode/api';
import {
  fetchSolutionArticle,
  fetchSolutions,
  type SolutionArticle,
  type SolutionSummary,
} from '../leetcode/solutions';
import { log } from '../log';
import { readMetadata } from '../workspace/problemFiles';

/** How many of the top solutions to offer. */
const SOLUTION_COUNT = 20;

/** Reads as "1.7k" so a vote count does not dominate the row. */
function compact(value: number): string {
  if (value < 1000) {
    return `${value}`;
  }
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
}

/**
 * Renders an article as the Markdown document it already is.
 *
 * The bodies are Markdown, so VS Code's own preview does a better job than a
 * hand-rolled webview would: syntax highlighted code blocks, working links,
 * text that can be selected and copied, and no HTML sanitiser or Markdown
 * renderer to ship. The heading carries what the listing showed, since a
 * preview tab has no other place to put it.
 */
function asMarkdown(article: SolutionArticle, problem: string): string {
  const when =
    article.createdAt === 0 ? '' : new Date(article.createdAt * 1000).toISOString().slice(0, 10);

  return [
    `# ${article.title}`,
    '',
    `**${problem}** · by ${article.author}${when === '' ? '' : ` on ${when}`}`,
    '',
    `${article.votes} votes · ${article.views} views · ${article.comments} comments`,
    '',
    '---',
    '',
    article.content,
    '',
  ].join('\n');
}

function describe(solution: SolutionSummary): vscode.QuickPickItem & { id: string } {
  return {
    id: solution.id,
    label: solution.title,
    description: `${compact(solution.votes)} votes`,
    detail: `by ${solution.author} · ${compact(solution.views)} views · ${solution.comments} comments`,
  };
}

/**
 * Lists community solutions for the problem in front of the reader, and opens
 * the chosen one.
 *
 * Articles are written into global storage rather than the problem folder: they
 * are somebody else's work, and the practice workflow archives whatever sits
 * beside a solution.
 */
export async function showSolutions(context: vscode.ExtensionContext, api: Api): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    void vscode.window.showWarningMessage('Open a solution file first.');
    return;
  }

  const metadata = await readMetadata(editor.document.uri);
  if (metadata === undefined) {
    void vscode.window.showWarningMessage(
      'This file is not inside a problem folder. Open a problem from the sidebar first.',
    );
    return;
  }

  const heading = `${metadata.questionFrontendId}. ${metadata.title}`;

  try {
    const solutions = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: `Loading solutions for ${heading}` },
      () => fetchSolutions(api, metadata.titleSlug, SOLUTION_COUNT),
    );

    if (solutions.length === 0) {
      void vscode.window.showInformationMessage(`Nobody has posted a solution to ${heading} yet.`);
      return;
    }

    const picked = await vscode.window.showQuickPick(solutions.map(describe), {
      placeHolder: `Solutions for ${heading}, most upvoted first`,
      matchOnDetail: true,
    });
    if (picked === undefined) {
      return;
    }

    const article = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: 'Loading solution' },
      () => fetchSolutionArticle(api, picked.id),
    );

    const folder = vscode.Uri.joinPath(context.globalStorageUri, 'solutions-read');
    await vscode.workspace.fs.createDirectory(folder);
    const file = vscode.Uri.joinPath(folder, `${metadata.titleSlug}-${article.id}.md`);
    await vscode.workspace.fs.writeFile(
      file,
      new TextEncoder().encode(asMarkdown(article, heading)),
    );

    await vscode.commands.executeCommand('markdown.showPreviewToSide', file);
    log.info(`Opened solution ${article.id} for ${metadata.titleSlug}`);
  } catch (err) {
    log.error(`Could not load solutions for ${metadata.titleSlug}`, err);
    const choice = await vscode.window.showErrorMessage(
      `Could not load solutions: ${err instanceof Error ? err.message : String(err)}`,
      'Show Output',
    );
    if (choice === 'Show Output') {
      log.show();
    }
  }
}
