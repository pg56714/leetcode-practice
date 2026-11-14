import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import * as vscode from 'vscode';
import type { AuthContext } from '../commands/signIn';
import { WebAuth } from '../leetcode/webAuth';
import { log } from '../log';

const EXTENSION_ID = 'sam56714.leetcode-practice-sam56714';

/**
 * A callback from the browser that carries no cookie. That is enough to tell
 * an accepted callback from an ignored one without signing anybody in: an
 * accepted one goes on to complain about the missing cookie.
 */
const emptyCallback = { authority: EXTENSION_ID, query: '' } as vscode.Uri;

/** What WebAuth.handleUri logged about one callback. */
async function outcomeOf(auth: WebAuth, uri: vscode.Uri): Promise<'accepted' | 'ignored'> {
  const errors = spyOn(log, 'error');
  try {
    await auth.handleUri(uri);
    const messages = errors.mock.calls.map(([message]) => message);
    if (messages.includes('Authorisation callback carried no cookie')) {
      return 'accepted';
    }
    return 'ignored';
  } finally {
    errors.mockRestore();
  }
}

function webAuth(): WebAuth {
  return new WebAuth(EXTENSION_ID, {} as AuthContext);
}

/**
 * The browser hand-off, which returns the session in a URL and so must only
 * accept a callback it asked for.
 *
 * Seen in a real log: two "Started web authorisation" lines in the same
 * second from a double-clicked status bar, then the callback that came back
 * 16 seconds later "ignored" — two prompts had opened, and cancelling one
 * cleared the pending state the other needed.
 */
describe('WebAuth', () => {
  let openExternal: ReturnType<typeof spyOn> | undefined;
  afterEach(() => {
    openExternal?.mockRestore();
    openExternal = undefined;
  });

  test('a double click opens the browser once', async () => {
    let release: () => void = () => undefined;
    const answered = new Promise<boolean>((resolve) => {
      release = () => resolve(true);
    });
    openExternal = spyOn(vscode.env, 'openExternal').mockImplementation(() => answered);
    const auth = webAuth();

    const first = auth.start();
    const second = auth.start();
    release();
    await Promise.all([first, second]);

    expect(openExternal).toHaveBeenCalledTimes(1);
  });

  test('accepts the callback once the page has opened', async () => {
    openExternal = spyOn(vscode.env, 'openExternal').mockResolvedValue(true);
    const auth = webAuth();
    await auth.start();

    expect(await outcomeOf(auth, emptyCallback)).toBe('accepted');
  });

  test('a cancelled second attempt leaves the first one able to answer', async () => {
    openExternal = spyOn(vscode.env, 'openExternal')
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const auth = webAuth();
    await auth.start();
    // A second click after the first page opened, its prompt then cancelled.
    await auth.start();

    expect(await outcomeOf(auth, emptyCallback)).toBe('accepted');
  });

  test('a callback nothing asked for is ignored', async () => {
    expect(await outcomeOf(webAuth(), emptyCallback)).toBe('ignored');
  });

  test('a cancelled prompt does not start waiting for a callback', async () => {
    openExternal = spyOn(vscode.env, 'openExternal').mockResolvedValue(false);
    const auth = webAuth();
    await auth.start();

    expect(await outcomeOf(auth, emptyCallback)).toBe('ignored');
  });

  test('a callback addressed to another extension is ignored', async () => {
    openExternal = spyOn(vscode.env, 'openExternal').mockResolvedValue(true);
    const auth = webAuth();
    await auth.start();

    const elsewhere = { authority: 'someone.else', query: '' } as vscode.Uri;
    expect(await outcomeOf(auth, elsewhere)).toBe('ignored');
  });

  test('accepts only one callback per attempt', async () => {
    openExternal = spyOn(vscode.env, 'openExternal').mockResolvedValue(true);
    const auth = webAuth();
    await auth.start();

    expect(await outcomeOf(auth, emptyCallback)).toBe('accepted');
    expect(await outcomeOf(auth, emptyCallback)).toBe('ignored');
  });
});
