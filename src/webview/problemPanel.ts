import * as vscode from 'vscode';
import xss from 'xss';
import type { ProblemDetail } from '../leetcode/types';

/**
 * Tags and attributes kept when sanitising a problem statement.
 *
 * LeetCode statements are its own content, but the same renderer will show
 * user-written discussion posts later, so the whitelist is the floor rather
 * than a formality. Superscript and subscript matter: LeetCode writes all its
 * maths that way — sampling 40 problems found zero LaTeX and a dozen using
 * <sup>, which is why no maths renderer is bundled.
 */
const ALLOWED: Record<string, string[]> = {
  p: [],
  br: [],
  strong: [],
  b: [],
  em: [],
  i: [],
  u: [],
  code: [],
  pre: [],
  ul: [],
  ol: [],
  li: [],
  sup: [],
  sub: [],
  blockquote: [],
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  span: ['class'],
  div: ['class'],
  table: [],
  thead: [],
  tbody: [],
  tr: [],
  th: [],
  td: [],
  img: ['src', 'alt', 'width', 'height'],
  a: ['href', 'title'],
  font: ['color'],
};

/**
 * The problem statement panel.
 *
 * One panel is reused for every problem: opening a second problem replaces the
 * contents rather than piling up tabs. It sits in the first column with the code
 * to its right, which is how leetcode.com itself reads and the order the work
 * happens in. Scripts stay disabled and the content
 * security policy allows only inline styles and remote images, because nothing
 * here needs to execute — the statement is static HTML.
 */
export class ProblemPanel {
  private panel: vscode.WebviewPanel | undefined;

  show(detail: ProblemDetail): void {
    if (this.panel === undefined) {
      this.panel = vscode.window.createWebviewPanel(
        'leetcodePractice.problem',
        detail.title,
        { viewColumn: vscode.ViewColumn.One, preserveFocus: true },
        { enableScripts: false, retainContextWhenHidden: true },
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    }

    this.panel.title = `${detail.number}. ${detail.title}`;
    this.panel.webview.html = render(detail);
    this.panel.reveal(vscode.ViewColumn.One, true);
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }
}

/** Escapes text destined for an HTML context. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const DIFFICULTY_VAR: Record<string, string> = {
  Easy: 'var(--vscode-charts-green)',
  Medium: 'var(--vscode-charts-yellow)',
  Hard: 'var(--vscode-charts-red)',
};

function render(detail: ProblemDetail): string {
  const statement = xss(detail.content, { whiteList: ALLOWED });
  const colour = DIFFICULTY_VAR[detail.difficulty] ?? 'var(--vscode-foreground)';
  const tags = detail.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline';">
<style>
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    line-height: 1.6;
    padding: 0 1.6rem 3rem;
    max-width: 46rem;
    margin: 0 auto;
  }
  h1.title { font-size: 1.35rem; margin: 1.2rem 0 0.4rem; }
  .meta { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-bottom: 1.2rem; }
  .difficulty { color: ${colour}; font-weight: 600; }
  .tag {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 999px;
    padding: 0.1rem 0.55rem;
    font-size: 0.8em;
  }
  pre {
    background: var(--vscode-textCodeBlock-background);
    padding: 0.8rem 1rem;
    border-radius: 4px;
    overflow-x: auto;
    white-space: pre-wrap;
  }
  code {
    background: var(--vscode-textCodeBlock-background);
    border-radius: 3px;
    padding: 0.1rem 0.3rem;
    font-family: var(--vscode-editor-font-family);
  }
  pre code { background: none; padding: 0; }
  a { color: var(--vscode-textLink-foreground); }
  img { max-width: 100%; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid var(--vscode-panel-border); padding: 0.3rem 0.6rem; }
</style>
</head>
<body>
  <h1 class="title">${escapeHtml(detail.number)}. ${escapeHtml(detail.title)}</h1>
  <div class="meta">
    <span class="difficulty">${escapeHtml(detail.difficulty)}</span>
    ${tags}
  </div>
  ${statement}
</body>
</html>`;
}
