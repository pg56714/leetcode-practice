import * as vscode from 'vscode';
import type { Api } from '../leetcode/api';
import type { Catalogue } from '../leetcode/catalogue';
import { extensionFor, SUPPORTED_LANGUAGES } from '../leetcode/languages';
import { log } from '../log';
import type { ProblemPanel } from '../webview/problemPanel';
import { readMetadata } from '../workspace/problemFiles';

/**
 * Reopens the statement for the problem in front of the reader.
 *
 * Opening a problem shows its statement, but a panel that has been closed
 * cannot be got back without reopening the problem itself — which is a strange
 * thing to have to do while halfway through solving it.
 */
export async function showStatement(api: Api, panel: ProblemPanel): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    void vscode.window.showWarningMessage('Open a solution file first.');
    return;
  }

  const metadata = await readMetadata(editor.document.uri);
  if (metadata === undefined) {
    void vscode.window.showWarningMessage('This file is not inside a problem folder.');
    return;
  }

  try {
    const detail = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: 'Loading problem' },
      () => api.questionDetail(metadata.titleSlug),
    );
    panel.show(detail);
  } catch (err) {
    log.error(`Could not load the statement for ${metadata.titleSlug}`, err);
    void vscode.window.showErrorMessage(
      `Could not load the statement: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Sets the language new problems open in.
 *
 * The setting is a plain string, so this exists to spare anyone having to know
 * that "python3" and "golang" are the spellings LeetCode uses. Switching one
 * problem is a different command; this decides the default for the next one.
 */
export async function changeDefaultLanguage(): Promise<void> {
  const configuration = vscode.workspace.getConfiguration('leetcodePractice');
  const current = configuration.get<string>('defaultLanguage');

  const picked = await vscode.window.showQuickPick(
    SUPPORTED_LANGUAGES.map((slug) => ({
      label: slug,
      description:
        slug === current ? `main.${extensionFor(slug)} · current` : `main.${extensionFor(slug)}`,
    })),
    { placeHolder: 'Language for problems you open from now on' },
  );
  if (picked === undefined) {
    return;
  }

  await configuration.update('defaultLanguage', picked.label, vscode.ConfigurationTarget.Global);
  void vscode.window.showInformationMessage(`New problems will open in ${picked.label}.`);
}

/**
 * Throws away everything cached on disk.
 *
 * The problem list is cached for a week and solved state can go stale within
 * it; the articles that have been read pile up quietly. Neither is precious —
 * this is the escape hatch for when the sidebar shows something that looks
 * wrong, and the alternative is hunting through global storage by hand.
 */
export async function clearCache(
  context: vscode.ExtensionContext,
  catalogue: Catalogue,
): Promise<void> {
  const confirmed = await vscode.window.showWarningMessage(
    'Delete the cached problem list and any solutions read? Your own solution files are untouched.',
    { modal: true },
    'Delete',
  );
  if (confirmed !== 'Delete') {
    return;
  }

  for (const name of ['problems.json', 'solutions-read']) {
    const target = vscode.Uri.joinPath(context.globalStorageUri, name);
    try {
      await vscode.workspace.fs.delete(target, { recursive: true, useTrash: false });
      log.info(`Deleted ${name}`);
    } catch {
      // Not being there is the outcome asked for, so nothing to report.
    }
  }

  await catalogue.refresh();
  void vscode.window.showInformationMessage('Cache cleared.');
}
