import { spyOn } from 'bun:test';
import * as vscode from 'vscode';

/**
 * Backs vscode.workspace.fs with a map, for code that reads and writes files.
 *
 * Keys are URI paths, which the vscode stub resolves the way the real joinPath
 * does. Call restore() once the test is done, so the next one starts from the
 * stub's "not stubbed" again.
 */
export function memoryFs() {
  const files = new Map<string, Uint8Array>();
  const folders = new Set<string>();
  const missing = (uri: vscode.Uri) => new Error(`EntryNotFound: ${uri.path}`);

  const spies = [
    spyOn(vscode.workspace.fs, 'readFile').mockImplementation(async (uri) => {
      const content = files.get(uri.path);
      if (content === undefined) {
        throw missing(uri);
      }
      return content;
    }),
    spyOn(vscode.workspace.fs, 'writeFile').mockImplementation(async (uri, content) => {
      files.set(uri.path, content);
    }),
    spyOn(vscode.workspace.fs, 'stat').mockImplementation(async (uri) => {
      if (!files.has(uri.path) && !folders.has(uri.path)) {
        throw missing(uri);
      }
      return { type: 1, ctime: 0, mtime: 0, size: 0 } as vscode.FileStat;
    }),
    spyOn(vscode.workspace.fs, 'createDirectory').mockImplementation(async (uri) => {
      folders.add(uri.path);
    }),
  ];

  return {
    read(path: string): string | undefined {
      const content = files.get(path);
      return content === undefined ? undefined : new TextDecoder().decode(content);
    },
    write(path: string, text: string): void {
      files.set(path, new TextEncoder().encode(text));
    },
    restore(): void {
      for (const spy of spies) {
        spy.mockRestore();
      }
    },
  };
}
