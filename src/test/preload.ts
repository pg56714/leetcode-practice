import { mock } from 'bun:test';
import { posix } from 'node:path';

/** A file URI reduced to what the code under test reads from one. */
function fileUri(path: string) {
  return { scheme: 'file', path, fsPath: path, toString: () => `file://${path}` };
}

function notStubbed(): never {
  throw new Error('not stubbed');
}

/**
 * Stands in for the `vscode` module, which only exists inside the editor.
 *
 * The logic worth testing is pure, but it sits in files that reach the editor
 * API somewhere — a logger, a type import — so without this nothing under test
 * can even be loaded. Only the pieces the tested paths actually touch are here;
 * anything else missing will fail loudly rather than quietly returning
 * undefined, which is the behaviour to want from a stub. The file system
 * throws until a test backs it, see memoryFs.ts.
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
    // Resolves ".." the way the real joinPath does, which is how a solution
    // file finds the metadata beside it.
    joinPath: (base: { path: string }, ...parts: string[]) =>
      fileUri(posix.join(base.path, ...parts)),
    file: (fsPath: string) => fileUri(fsPath.replaceAll('\\', '/')),
    parse: (value: string) => ({ fsPath: value, path: value, toString: () => value }),
  },
  workspace: {
    getConfiguration: () => ({ get: () => undefined }),
    // Open editors; a test that needs one pushes it and takes it out again.
    textDocuments: [],
    fs: {
      readFile: notStubbed,
      writeFile: notStubbed,
      stat: notStubbed,
      createDirectory: notStubbed,
    },
  },
  ConfigurationTarget: { Global: 1 },
  ProgressLocation: { Notification: 15, Window: 10 },
  ViewColumn: { One: 1, Two: 2, Beside: -2 },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
}));
