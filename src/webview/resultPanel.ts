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

/** Renders a list of cases side by side with what was expected. */
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
    // Only claim a case failed when there is something to compare it against.
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
 * The panel showing what the judge said.
 *
 * One panel is reused, in the bottom-of-the-screen sense: results replace each
 * other, because the only interesting result is the latest one. Sections appear
 * only when the payload carries them — a compile error has no cases, an
 * accepted submission has no failing input.
 */
export class ResultPanel {
  private panel: vscode.WebviewPanel | undefined;

  /** Shows a spinner-ish placeholder while the judge is still working. */
  waiting(title: string): void {
    this.render(title, '<p class="waiting">Waiting for LeetCode…</p>');
  }

  show(title: string, result: JudgeResult, input: string[]): void {
    const summary = `
      <p class="verdict ${result.accepted ? 'ok' : 'bad'}">${escapeHtml(result.statusMessage)}</p>
      <p class="stats">
        ${result.totalCorrect !== undefined && result.totalTestcases !== undefined ? `${result.totalCorrect} / ${result.totalTestcases} passed` : ''}
        ${result.runtime !== undefined ? ` · ${escapeHtml(result.runtime)}` : ''}
        ${result.memory !== undefined ? ` · ${escapeHtml(result.memory)}` : ''}
      </p>`;

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

    this.render(title, summary + sections.join(''));
  }

  private render(title: string, body: string): void {
    if (this.panel === undefined) {
      this.panel = vscode.window.createWebviewPanel(
        'leetcodePractice.result',
        title,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: false, retainContextWhenHidden: true },
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    }
    this.panel.title = title;
    this.panel.webview.html = page(body);
    this.panel.reveal(vscode.ViewColumn.Beside, true);
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
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
    padding: 0 1.4rem 2rem;
    max-width: 46rem;
    margin: 0 auto;
    line-height: 1.5;
  }
  .verdict { font-size: 1.2rem; font-weight: 600; margin: 1.2rem 0 0.2rem; }
  .verdict.ok { color: var(--vscode-charts-green); }
  .verdict.bad { color: var(--vscode-charts-red); }
  .stats { color: var(--vscode-descriptionForeground); margin: 0 0 1rem; }
  .waiting { color: var(--vscode-descriptionForeground); margin-top: 1.4rem; }
  h2 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em;
       color: var(--vscode-descriptionForeground); margin: 1.4rem 0 0.4rem; }
  .label { margin: 0.6rem 0 0.2rem; color: var(--vscode-descriptionForeground); font-size: 0.85em; }
  pre {
    background: var(--vscode-textCodeBlock-background);
    padding: 0.6rem 0.8rem;
    border-radius: 4px;
    overflow-x: auto;
    white-space: pre-wrap;
    margin: 0;
  }
  table { border-collapse: collapse; width: 100%; }
  th { text-align: left; font-size: 0.8rem; color: var(--vscode-descriptionForeground); }
  th, td { border-bottom: 1px solid var(--vscode-panel-border); padding: 0.35rem 0.5rem;
           vertical-align: top; }
  tr.fail td:first-child { border-left: 3px solid var(--vscode-charts-red); }
  tr.pass td:first-child { border-left: 3px solid var(--vscode-charts-green); }
  code { font-family: var(--vscode-editor-font-family); }
</style>
</head>
<body>${body}</body>
</html>`;
}
