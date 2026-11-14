import * as vscode from 'vscode';
import type { Api } from '../leetcode/api';
import { extensionFor } from '../leetcode/languages';
import { log } from '../log';
import { createProblemFolder, fileLanguage, fileNameOf } from '../workspace/problemFiles';
import { activeProblem, reportFailure } from './common';

/**
 * Switches the language of the problem in front of the reader.
 *
 * The existing file is never touched: switching writes the new language's
 * template alongside it, so a problem can hold main.py and main.rs at once.
 * That is deliberate — redoing a solved problem in another language is a
 * practice technique, not an accident — and Test and Submit take the language
 * recorded for whichever file is open rather than the folder's.
 */
export async function changeLanguage(context: vscode.ExtensionContext, api: Api): Promise<void> {
  const active = await activeProblem();
  if (active === undefined) {
    return;
  }
  const { editor, metadata } = active;
  const current = fileLanguage(metadata, fileNameOf(editor.document.uri));

  try {
    const detail = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: 'Loading languages' },
      () => api.questionDetail(metadata.titleSlug),
    );

    const picked = await vscode.window.showQuickPick(
      detail.snippets.map((snippet) => ({
        label: snippet.lang,
        description:
          snippet.langSlug === current
            ? `main.${extensionFor(snippet.langSlug)} · current`
            : `main.${extensionFor(snippet.langSlug)}`,
        langSlug: snippet.langSlug,
      })),
      { placeHolder: `Language for ${metadata.questionFrontendId}. ${metadata.title}` },
    );

    if (picked === undefined) {
      return;
    }

    // What the target file was recorded as before the switch, which is what
    // tells reopening a solution apart from moving it to another dialect.
    const fileName = `main.${extensionFor(picked.langSlug)}`;
    const before = fileLanguage(metadata, fileName);

    const opened = await createProblemFolder(context, detail, picked.langSlug, {
      explicit: true,
    });
    const document = await vscode.workspace.openTextDocument(opened.solution);
    await vscode.window.showTextDocument(document, { preview: false });

    log.info(
      `${metadata.titleSlug}: switched to ${opened.langSlug}, ${
        opened.created ? 'new file' : 'file already existed'
      }`,
    );
    if (!opened.created) {
      // SQL dialects all use main.sql, so switching between them keeps the file
      // that is already there and records the new dialect against it.
      const message =
        before === opened.langSlug
          ? `Reopened your existing ${picked.label} solution.`
          : `Switched to ${picked.label}, in the same ${fileName}.`;
      void vscode.window.showInformationMessage(message);
    }
  } catch (err) {
    await reportFailure(`Could not switch language for ${metadata.titleSlug}`, err);
  }
}
