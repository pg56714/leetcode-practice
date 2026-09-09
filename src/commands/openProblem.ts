import * as vscode from 'vscode';
import type { Api } from '../leetcode/api';
import { isKnownLanguage } from '../leetcode/languages';
import { log } from '../log';
import type { ProblemPanel } from '../webview/problemPanel';
import { createProblemFolder } from '../workspace/problemFiles';

const FALLBACK_LANGUAGE = 'python3';

/** The configured language, or python3 when the setting is empty or unknown. */
function preferredLanguage(): string {
  const configured = vscode.workspace
    .getConfiguration('leetcodePractice')
    .get<string>('defaultLanguage');

  if (configured !== undefined && isKnownLanguage(configured)) {
    return configured;
  }
  if (configured !== undefined && configured.trim() !== '') {
    log.info(
      `defaultLanguage "${configured}" is not a language I know; using ${FALLBACK_LANGUAGE}`,
    );
  }
  return FALLBACK_LANGUAGE;
}

/**
 * Opens a problem: fetch it, lay out its folder, show the statement and code.
 *
 * The statement takes the first column and the code the second, matching how
 * leetcode.com reads. The statement never takes focus, so the cursor lands in
 * the editor ready to type.
 */
export async function openProblem(
  context: vscode.ExtensionContext,
  api: Api,
  panel: ProblemPanel,
  slug: string,
): Promise<void> {
  try {
    const detail = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: `Opening ${slug}` },
      () => api.questionDetail(slug),
    );

    const opened = await createProblemFolder(context, detail, preferredLanguage());
    panel.show(detail);

    const document = await vscode.workspace.openTextDocument(opened.solution);
    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.Two,
      preview: false,
    });

    log.info(
      `${opened.created ? 'Created' : 'Reopened'} ${opened.folder.fsPath} (${opened.langSlug})`,
    );
  } catch (err) {
    log.error(`Could not open ${slug}`, err);
    const choice = await vscode.window.showErrorMessage(
      `Could not open ${slug}: ${err instanceof Error ? err.message : String(err)}`,
      'Show Output',
    );
    if (choice === 'Show Output') {
      log.show();
    }
  }
}
