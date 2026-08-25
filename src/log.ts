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
   * Logs an error. `detail` is anything caught in a try/catch — Error, string,
   * or some unknown thrown value — and is reduced to a single readable line.
   */
  error(message: string, detail?: unknown): void {
    const suffix = detail === undefined ? '' : `: ${detail instanceof Error ? detail.message : String(detail)}`;
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
