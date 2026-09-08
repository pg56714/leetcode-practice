import * as vscode from 'vscode';
import type { JudgeResult } from '../leetcode/judge';

/** Escapes text destined for an HTML context. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function block(title: string, body: string): string {
  return `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function pre(text: string): string {
  return `<pre>${escapeHtml(text)}</pre>`;
}

/** Lays each case out against what was expected of it. */
function cases(result: JudgeResult, input: string[]): string {
  const answers = result.answers ?? [];
  const expected = result.expected ?? [];
  const count = Math.max(answers.length, expected.length, input.length);
  if (count === 0) {
    return '';
  }

  const rows: string[] = [];
  for (let i = 0; i < count; i++) {
    const got = answers[i];
    const want = expected[i];
    // Only call a case failed when there is something to compare it against.
    const passed = want === undefined || got === want;
    rows.push(`<tr class="${passed ? 'pass' : 'fail'}">
      <td>${i + 1}</td>
      <td><code>${escapeHtml(input[i] ?? '')}</code></td>
      <td><code>${escapeHtml(got ?? '')}</code></td>
      <td><code>${escapeHtml(want ?? '')}</code></td>
    </tr>`);
  }

  return block(
    'Cases',
    `<table>
      <thead><tr><th>#</th><th>Input</th><th>Output</th><th>Expected</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`,
  );
}

/**
 * Judge results, shown in the panel alongside Terminal and Output.
 *
 * They live there rather than in an editor tab because a result is something to
 * glance at while the code stays on screen; an editor tab would either steal
 * half the window or hide behind the file being edited.
 *
 * The panel may never have been opened, in which case there is no webview to
 * write to yet. So the markup is kept here and handed over when the view is
 * resolved, and rendering asks VS Code to focus the view — which resolves it.
 */
export class ResultView implements vscode.WebviewViewProvider {
  static readonly viewId = 'leetcodePractice.results';

  private view: vscode.WebviewView | undefined;
  private html = page('<p class="idle">Run a solution to see results here.</p>');
  private heading = '';

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: false };
    view.webview.html = this.html;
    if (this.heading !== '') {
      view.description = this.heading;
    }
  }

  /** Placeholder shown while the judge is still working. */
  waiting(heading: string): void {
    this.render(heading, '<p class="idle">Waiting for LeetCode…</p>');
  }

  /** Shown when nothing was judged, with the reason. */
  failed(heading: string, message: string): void {
    this.render(
      heading,
      `<p class="verdict bad">Not judged</p><p class="stats">${escapeHtml(message)}</p>`,
    );
  }

  show(heading: string, result: JudgeResult, input: string[]): void {
    const counted =
      result.totalCorrect !== undefined && result.totalTestcases !== undefined
        ? `${result.totalCorrect} / ${result.totalTestcases} passed`
        : '';
    const timing = [
      result.runtime === undefined ? '' : escapeHtml(result.runtime),
      result.memory === undefined ? '' : escapeHtml(result.memory),
    ].filter((part) => part !== '');

    const summary = `
      <p class="verdict ${result.accepted ? 'ok' : 'bad'}">${escapeHtml(result.statusMessage)}</p>
      <p class="stats">${[counted, ...timing].filter((part) => part !== '').join(' · ')}</p>`;

    const sections = [
      result.compileError !== undefined ? block('Compile error', pre(result.compileError)) : '',
      result.runtimeError !== undefined ? block('Runtime error', pre(result.runtimeError)) : '',
      cases(result, input),
      result.failedInput !== undefined
        ? block(
            'Failing case',
            `${pre(result.failedInput)}
             <p class="label">Expected</p>${pre(result.failedExpected ?? '')}
             <p class="label">Got</p>${pre(result.failedActual ?? '')}`,
          )
        : '',
      result.stdout !== undefined && result.stdout.length > 0
        ? block('Printed output', pre(result.stdout.join('\n')))
        : '',
    ];

    this.render(heading, summary + sections.join(''));
  }

  private render(heading: string, body: string): void {
    this.heading = heading;
    this.html = page(body);

    if (this.view === undefined) {
      // Focusing an unresolved view is what causes VS Code to resolve it, and
      // resolution picks up the markup stored above.
      void vscode.commands.executeCommand(`${ResultView.viewId}.focus`);
      return;
    }
    this.view.description = heading;
    this.view.webview.html = this.html;
    this.view.show(true);
  }
}

function page(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    padding: 0.6rem 1rem 1.4rem;
    line-height: 1.5;
  }
  .verdict { font-size: 1.1rem; font-weight: 600; margin: 0.2rem 0 0.1rem; }
  .verdict.ok { color: var(--vscode-charts-green); }
  .verdict.bad { color: var(--vscode-charts-red); }
  .stats, .idle { color: var(--vscode-descriptionForeground); margin: 0 0 0.8rem; }
  h2 {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--vscode-descriptionForeground);
    margin: 1rem 0 0.3rem;
  }
  .label { margin: 0.5rem 0 0.15rem; color: var(--vscode-descriptionForeground); font-size: 0.85em; }
  pre {
    background: var(--vscode-textCodeBlock-background);
    padding: 0.5rem 0.7rem;
    border-radius: 4px;
    overflow-x: auto;
    white-space: pre-wrap;
    margin: 0;
  }
  table { border-collapse: collapse; width: 100%; max-width: 60rem; }
  th { text-align: left; font-size: 0.78rem; color: var(--vscode-descriptionForeground); }
  th, td {
    border-bottom: 1px solid var(--vscode-panel-border);
    padding: 0.3rem 0.5rem;
    vertical-align: top;
  }
  tr.fail td:first-child { border-left: 3px solid var(--vscode-charts-red); }
  tr.pass td:first-child { border-left: 3px solid var(--vscode-charts-green); }
  code { font-family: var(--vscode-editor-font-family); }
</style>
</head>
<body>${body}</body>
</html>`;
}
