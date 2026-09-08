import * as vscode from 'vscode';

/**
 * Single output channel for the whole extension.
 *
 * Created lazily so that merely activating the extension does not add a channel
 * to the user's Output dropdown before there is anything to say.
 */
let channel: vscode.OutputChannel | undefined;

function out(): vscode.OutputChannel {
  channel ??= vscode.window.createOutputChannel('LeetCode Practice');
  return channel;
}

function stamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export const log = {
  info(message: string): void {
    out().appendLine(`${stamp()}  ${message}`);
  },

  /**
   * Logs a payload worth inspecting when something looks wrong.
   *
   * Judge responses change shape depending on how far a run got, so the raw
   * payload goes here: when the panel renders something unexpected, the answer
   * is in the output channel rather than in a guess.
   */
  debug(message: string, payload?: unknown): void {
    const body =
      payload === undefined
        ? ''
        : `
${JSON.stringify(payload, null, 2)}`;
    out().appendLine(`${stamp()}  ${message}${body}`);
  },

  /**
   * Logs an error. `detail` is anything caught in a try/catch — Error, string,
   * or some unknown thrown value — and is reduced to a single readable line.
   */
  error(message: string, detail?: unknown): void {
    const suffix =
      detail === undefined ? '' : `: ${detail instanceof Error ? detail.message : String(detail)}`;
    out().appendLine(`${stamp()}  ERROR ${message}${suffix}`);
  },

  show(): void {
    out().show(true);
  },

  dispose(): void {
    channel?.dispose();
    channel = undefined;
  },
};
