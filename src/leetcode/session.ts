import type * as vscode from 'vscode';
import type { Credentials } from './types';

/** Where the credentials live in secret storage. */
export const SECRET_KEY = 'leetcodePractice.credentials';

/**
 * Holds the LeetCode credentials and keeps them in VS Code's secret storage.
 *
 * Secret storage is per extension id, so credentials never leak into settings
 * files, workspace state, or anything that gets synced as plain text.
 */
export class Session {
  private cached: Credentials | undefined;

  constructor(private readonly secrets: vscode.SecretStorage) {}

  /** Reads credentials, falling back to secret storage on the first call. */
  async read(): Promise<Credentials | undefined> {
    if (this.cached) {
      return this.cached;
    }
    const stored = await this.secrets.get(SECRET_KEY);
    if (stored === undefined) {
      return undefined;
    }
    try {
      this.cached = JSON.parse(stored) as Credentials;
    } catch {
      // A corrupted entry is worse than none: drop it so the next sign-in works.
      await this.clear();
      return undefined;
    }
    return this.cached;
  }

  async write(credentials: Credentials): Promise<void> {
    this.cached = credentials;
    await this.secrets.store(SECRET_KEY, JSON.stringify(credentials));
  }

  async clear(): Promise<void> {
    this.cached = undefined;
    await this.secrets.delete(SECRET_KEY);
  }

  /**
   * Rereads secret storage after it changed, possibly in another window.
   *
   * Every window shares secret storage but caches what it read. A sign-in
   * elsewhere would otherwise leave this window signed out until it reloads,
   * and a sign-out elsewhere would leave it judging as the account that left.
   *
   * @returns True when the stored credentials differ from the ones this window
   *   was using. Its own writes already match, so they come back false.
   */
  async reload(): Promise<boolean> {
    const before = this.cached;
    this.cached = undefined;
    const after = await this.read();
    return before?.session !== after?.session || before?.csrfToken !== after?.csrfToken;
  }

  /**
   * Pulls the two cookies we need out of whatever the user pasted.
   *
   * Accepts a full `Cookie:` header, a fragment of one, or the two values in
   * either order, because that is what people actually copy out of DevTools.
   * Anything else in the string is ignored rather than rejected.
   */
  static parse(raw: string): Credentials | undefined {
    let session = '';
    let csrfToken = '';

    for (const match of raw.matchAll(/([A-Za-z_][\w-]*)\s*=\s*([^;\s]+)/g)) {
      const [, name, value] = match;
      if (name === 'LEETCODE_SESSION') {
        session = value ?? '';
      } else if (name === 'csrftoken') {
        csrfToken = value ?? '';
      }
    }

    return session && csrfToken ? { session, csrfToken } : undefined;
  }
}
