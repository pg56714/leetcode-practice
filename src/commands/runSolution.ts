import * as vscode from 'vscode';
import { wait } from '../leetcode/http';
import { isSettled, readResult } from '../leetcode/judge';
import type { JudgeApi } from '../leetcode/rest';
import { describeError, log } from '../log';
import type { ResultView } from '../webview/resultView';
import { fileLanguage, fileNameOf, readTestCases } from '../workspace/problemFiles';
import { activeProblem, reportFailure } from './common';

/** How long to wait between polls, and how long to keep waiting overall. */
const POLL_INTERVAL_MS = 1200;
const POLL_TIMEOUT_MS = 60_000;

/**
 * Splits test input into cases so results can be shown next to their input.
 *
 * A case occupies as many lines as the problem has parameters, which comes from
 * metaData and is stored when the folder is created.
 */
export function splitCases(input: string, linesPerCase: number): string[] {
  const lines = input.split('\n').filter((line) => line.trim() !== '');
  const size = Math.max(1, linesPerCase);
  const cases: string[] = [];
  for (let i = 0; i < lines.length; i += size) {
    cases.push(lines.slice(i, i + size).join('\n'));
  }
  return cases;
}

/**
 * Polls until the judge settles.
 *
 * LeetCode answers `state: PENDING` or `STARTED` while it works, so polling is
 * the only way to know. The overall timeout exists because a queue can stall
 * and waiting forever looks identical to a broken extension.
 */
async function pollUntilDone(
  judge: JudgeApi,
  slug: string,
  id: string,
  token: vscode.CancellationToken,
): Promise<unknown> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (token.isCancellationRequested) {
      return undefined;
    }
    const payload = await judge.check(slug, id);
    if (isSettled(payload)) {
      return payload;
    }
    await wait(POLL_INTERVAL_MS);
  }
  throw new Error('LeetCode is still judging after a minute; check the site directly');
}

/** Set while a run is in progress, from its first prompt to its result. */
let judging = false;

/** Told about each judged submission, so the sidebar can mark the problem. */
export type SubmissionListener = (slug: string, accepted: boolean) => void;

/**
 * Runs the active solution file, either as a test or as a real submission.
 *
 * One run at a time. A second run straight after the first is enough for
 * LeetCode to answer 429, and two results racing into one panel would show
 * whichever happened to land last.
 */
export async function runSolution(
  judge: JudgeApi,
  panel: ResultView,
  mode: 'test' | 'submit',
  onSubmitted?: SubmissionListener,
): Promise<void> {
  if (judging) {
    void vscode.window.showInformationMessage('LeetCode is still judging the previous run.');
    return;
  }
  judging = true;
  try {
    await judgeActiveFile(judge, panel, mode, onSubmitted);
  } finally {
    judging = false;
  }
}

/**
 * The run itself.
 *
 * The language is the one recorded for this file rather than the folder's: a
 * problem can hold main.py and main.rs at once, and the one being submitted is
 * the one in front of the reader.
 */
async function judgeActiveFile(
  judge: JudgeApi,
  panel: ResultView,
  mode: 'test' | 'submit',
  onSubmitted: SubmissionListener | undefined,
): Promise<void> {
  const active = await activeProblem();
  if (active === undefined) {
    return;
  }
  const { editor, metadata } = active;
  const file = editor.document.uri;

  // Checked before anything is rendered: judging without credentials fails at
  // the first header, and an offer to sign in is more use than that error.
  if (!(await judge.hasCredentials())) {
    const choice = await vscode.window.showWarningMessage(
      'Sign in to LeetCode before testing or submitting.',
      'Sign In',
    );
    if (choice === 'Sign In') {
      await vscode.commands.executeCommand('leetcodePractice.signIn');
    }
    return;
  }

  const lang = fileLanguage(metadata, fileNameOf(file));
  const code = editor.document.getText();
  if (code.trim() === '') {
    void vscode.window.showWarningMessage('There is nothing to send — the file is empty.');
    return;
  }

  if (mode === 'submit') {
    // Submissions are recorded against the account, so they get a confirmation.
    const confirmed = await vscode.window.showInformationMessage(
      `Submit ${metadata.questionFrontendId}. ${metadata.title} as ${lang}?`,
      { modal: true },
      'Submit',
    );
    if (confirmed !== 'Submit') {
      return;
    }
  }

  const input = mode === 'test' ? await readTestCases(file) : '';
  const heading = `${metadata.questionFrontendId}. ${metadata.title}`;

  await editor.document.save();

  try {
    // Inside the try: if the panel cannot be written to, that is a failure to
    // report like any other, not an exception escaping the command.
    panel.waiting(heading);
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: mode === 'test' ? `Testing ${heading}` : `Submitting ${heading}`,
        cancellable: true,
      },
      async (_progress, token) => {
        const id =
          mode === 'test'
            ? await judge.interpret(metadata.titleSlug, metadata.questionId, lang, code, input)
            : await judge.submit(metadata.titleSlug, metadata.questionId, lang, code);

        const payload = await pollUntilDone(judge, metadata.titleSlug, id, token);
        if (payload === undefined) {
          log.info('Judging cancelled');
          panel.failed(heading, 'Cancelled.');
          return;
        }

        const result = readResult(payload);
        panel.show(heading, result, splitCases(input, metadata.linesPerCase));
        log.info(`${mode === 'test' ? 'Test' : 'Submission'} finished: ${result.verdict}`);
        // Only a submission counts towards solved, as on LeetCode; a test run
        // changes nothing however it went.
        if (mode === 'submit') {
          onSubmitted?.(metadata.titleSlug, result.accepted);
        }
      },
    );
  } catch (err) {
    panel.failed(heading, describeError(err));
    await reportFailure(`${mode === 'test' ? 'Test' : 'Submission'} failed`, err);
  }
}
