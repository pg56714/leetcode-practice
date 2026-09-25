import { mock } from 'bun:test';

/**
 * Stands in for the `vscode` module, which only exists inside the editor.
 *
 * The logic worth testing is pure, but it sits in files that reach the editor
 * API somewhere — a logger, a type import — so without this nothing under test
 * can even be loaded. Only the pieces the tested paths actually touch are here;
 * anything else missing will fail loudly rather than quietly returning
 * undefined, which is the behaviour to want from a stub.
 */
mock.module('vscode', () => ({
  window: {
    createOutputChannel: () => ({
      appendLine: () => undefined,
      show: () => undefined,
      dispose: () => undefined,
    }),
  },
  Uri: {
    joinPath: (base: { fsPath: string }, ...parts: string[]) => ({
      fsPath: [base.fsPath, ...parts].join('/'),
    }),
    file: (fsPath: string) => ({ fsPath, path: fsPath.replaceAll('\\', '/') }),
    parse: (value: string) => ({ fsPath: value, toString: () => value }),
  },
  workspace: {
    getConfiguration: () => ({ get: () => undefined }),
    fs: {
      readFile: () => {
        throw new Error('not stubbed');
      },
    },
  },
  ConfigurationTarget: { Global: 1 },
  ProgressLocation: { Notification: 15, Window: 10 },
  ViewColumn: { One: 1, Two: 2, Beside: -2 },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
}));
