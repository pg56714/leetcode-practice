import * as vscode from 'vscode';
import { describeError, log } from '../log';
import { type ProblemMetadata, readMetadata } from '../workspace/problemFiles';

/** The solution file in front of the reader, and the problem it belongs to. */
export interface ActiveProblem {
  editor: vscode.TextEditor;
  metadata: ProblemMetadata;
}

/**
 * Finds the problem the active editor belongs to, or says why there is none.
 *
 * Every per-problem command starts here. Their buttons only appear on solution
 * files, but a command can still arrive from elsewhere, and a warning is more
 * use than a command that quietly does nothing.
 */
export async function activeProblem(): Promise<ActiveProblem | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    void vscode.window.showWarningMessage('Open a solution file first.');
    return undefined;
  }

  const metadata = await readMetadata(editor.document.uri);
  if (metadata === undefined) {
    void vscode.window.showWarningMessage(
      'This file is not inside a problem folder. Open a problem from the sidebar first.',
    );
    return undefined;
  }
  return { editor, metadata };
}

/**
 * Logs a failure and tells the reader, with a way to the details.
 *
 * The notification has room for one line; the output channel has the rest,
 * including whatever LeetCode actually answered.
 */
export async function reportFailure(message: string, err: unknown): Promise<void> {
  log.error(message, err);
  const choice = await vscode.window.showErrorMessage(
    `${message}: ${describeError(err)}`,
    'Show Output',
  );
  if (choice === 'Show Output') {
    log.show();
  }
}
