import * as vscode from 'vscode';
import type { Difficulty, ProblemSummary } from '../leetcode/types';

/**
 * Difficulty maps to a chart colour rather than a literal hex value, so the
 * rows stay legible in whatever theme the reader uses.
 */
const DIFFICULTY_COLOUR: Record<Difficulty, string> = {
  Easy: 'charts.green',
  Medium: 'charts.yellow',
  Hard: 'charts.red',
};

/**
 * The icon for one problem row.
 *
 * Two signals share one glyph: colour carries difficulty, shape carries how far
 * the reader has got. Encoding both means a row answers "how hard" and "have I
 * done this" without reading any text.
 */
export function problemIcon(problem: ProblemSummary): vscode.ThemeIcon {
  const colour = new vscode.ThemeColor(DIFFICULTY_COLOUR[problem.difficulty]);

  if (problem.paidOnly) {
    return new vscode.ThemeIcon('lock', colour);
  }
  if (problem.status === 'ac') {
    return new vscode.ThemeIcon('pass-filled', colour);
  }
  if (problem.status === 'notac') {
    return new vscode.ThemeIcon('circle-filled', colour);
  }
  return new vscode.ThemeIcon('circle-outline', colour);
}
