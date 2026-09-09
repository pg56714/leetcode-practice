import * as vscode from 'vscode';
import type { Api } from '../leetcode/api';
import { extensionFor } from '../leetcode/languages';
import { log } from '../log';
import { createProblemFolder, readMetadata } from '../workspace/problemFiles';

/**
 * Switches the language of the problem in front of the reader.
 *
 * The existing file is never touched: switching writes the new language's
 * template alongside it, so a problem can hold main.py and main.rs at once.
 * That is deliberate — redoing a solved problem in another language is a
 * practice technique, not an accident — and Test and Submit already take the
 * language from whichever file is open rather than from the folder.
 */
export async function changeLanguage(context: vscode.ExtensionContext, api: Api): Promise<void> {
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

  try {
    const detail = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: 'Loading languages' },
      () => api.questionDetail(metadata.titleSlug),
    );

    const picked = await vscode.window.showQuickPick(
      detail.snippets.map((snippet) => ({
        label: snippet.lang,
        description:
          snippet.langSlug === metadata.lang
            ? `main.${extensionFor(snippet.langSlug)} · current`
            : `main.${extensionFor(snippet.langSlug)}`,
        langSlug: snippet.langSlug,
      })),
      { placeHolder: `Language for ${metadata.questionFrontendId}. ${metadata.title}` },
    );

    if (picked === undefined) {
      return;
    }

    const opened = await createProblemFolder(context, detail, picked.langSlug);
    const document = await vscode.workspace.openTextDocument(opened.solution);
    await vscode.window.showTextDocument(document, { preview: false });

    log.info(
      `${metadata.titleSlug}: switched to ${opened.langSlug}, ${
        opened.created ? 'new file' : 'file already existed'
      }`,
    );
    if (!opened.created) {
      // SQL dialects all use main.sql, so switching between them reuses the file
      // that is already there rather than reopening one written in that dialect.
      const message =
        opened.langSlug === metadata.lang
          ? `Reopened your existing ${picked.label} solution.`
          : `Switched to ${picked.label}, in the same main.${extensionFor(opened.langSlug)}.`;
      void vscode.window.showInformationMessage(message);
    }
  } catch (err) {
    log.error(`Could not switch language for ${metadata.titleSlug}`, err);
    const choice = await vscode.window.showErrorMessage(
      `Could not switch language: ${err instanceof Error ? err.message : String(err)}`,
      'Show Output',
    );
    if (choice === 'Show Output') {
      log.show();
    }
  }
}
