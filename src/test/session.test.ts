import { describe, expect, test } from 'bun:test';
import type * as vscode from 'vscode';
import { Session } from '../leetcode/session';

const SESSION = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.payload.signature';
const CSRF = '8kZQ2nR7abcdef';

/** Secret storage as VS Code gives it: one store, shared by every window. */
function sharedSecrets(): vscode.SecretStorage {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key),
    store: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
  } as unknown as vscode.SecretStorage;
}

/**
 * Each window caches the credentials it read, so without rereading, signing in
 * in one window left another signed out until it reloaded, and signing out
 * left the other still judging as the account that had left.
 */
describe('Session.reload', () => {
  test('notices a sign-in made in another window', async () => {
    const secrets = sharedSecrets();
    const here = new Session(secrets);
    const elsewhere = new Session(secrets);
    expect(await here.read()).toBeUndefined();

    await elsewhere.write({ session: SESSION, csrfToken: CSRF });

    expect(await here.reload()).toBe(true);
    expect(await here.read()).toEqual({ session: SESSION, csrfToken: CSRF });
  });

  test('notices a sign-out made in another window', async () => {
    const secrets = sharedSecrets();
    const here = new Session(secrets);
    const elsewhere = new Session(secrets);
    await here.write({ session: SESSION, csrfToken: CSRF });

    await elsewhere.clear();

    expect(await here.reload()).toBe(true);
    expect(await here.read()).toBeUndefined();
  });

  test("does not count this window's own changes", async () => {
    const here = new Session(sharedSecrets());

    await here.write({ session: SESSION, csrfToken: CSRF });
    expect(await here.reload()).toBe(false);

    await here.clear();
    expect(await here.reload()).toBe(false);
  });
});

/**
 * What people actually paste.
 *
 * The DevTools route hands over a whole Cookie header carrying a dozen values;
 * some people trim it to the two that matter, in either order, sometimes with
 * the header name still attached. All of those are the same intent.
 */
describe('Session.parse', () => {
  test('takes the two values out of a full Cookie header', () => {
    const parsed = Session.parse(
      `gr_user_id=1; csrftoken=${CSRF}; LEETCODE_SESSION=${SESSION}; ip_check=false`,
    );
    expect(parsed).toEqual({ session: SESSION, csrfToken: CSRF });
  });

  test('does not care about the order', () => {
    expect(Session.parse(`LEETCODE_SESSION=${SESSION}; csrftoken=${CSRF}`)).toEqual({
      session: SESSION,
      csrfToken: CSRF,
    });
  });

  test('tolerates the header name and stray spaces', () => {
    expect(
      Session.parse(`Cookie:  LEETCODE_SESSION = ${SESSION} ;  csrftoken = ${CSRF} ;`),
    ).toEqual({ session: SESSION, csrfToken: CSRF });
  });

  test('refuses a paste missing either value', () => {
    expect(Session.parse(`LEETCODE_SESSION=${SESSION}`)).toBeUndefined();
    expect(Session.parse(`csrftoken=${CSRF}`)).toBeUndefined();
    expect(Session.parse('')).toBeUndefined();
    expect(Session.parse('not a cookie at all')).toBeUndefined();
  });

  test('is not fooled by a name that merely ends the same way', () => {
    // A cookie called NOT_LEETCODE_SESSION must not be read as the session.
    expect(Session.parse(`NOT_LEETCODE_SESSION=x; csrftoken=${CSRF}`)).toBeUndefined();
  });
});
