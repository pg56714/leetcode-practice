import * as vscode from 'vscode';
import { type AuthContext, applyCookieString } from '../commands/signIn';
import { log } from '../log';
import { ORIGIN } from './api';

/**
 * How long a started authorisation stays open.
 *
 * The window is what lets a callback arriving out of the blue be ignored. Five
 * minutes is longer than signing in takes, and short enough that a forgotten
 * attempt does not stay armed for the rest of the session.
 */
const PENDING_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Offers the manual route when the handoff did not work.
 *
 * The browser flow has more moving parts than pasting does — a URI scheme the
 * OS has to know, a callback that has to cross back into this window — so every
 * failure here points at the path that needs none of them.
 */
async function offerCookieInstead(message: string): Promise<void> {
  const choice = await vscode.window.showErrorMessage(message, 'Paste cookie instead');
  if (choice === 'Paste cookie instead') {
    await vscode.commands.executeCommand('leetcodePractice.signInWithCookie');
  }
}

/**
 * Browser handoff sign-in.
 *
 * LeetCode's authorize-login page takes the editor's URI scheme and an
 * extension id, and once the visitor is signed in it redirects to
 * `<scheme>://<extension id>?cookie=...`. Credentials therefore arrive as a
 * URL, so a callback is accepted only while an authorisation this extension
 * started is still open, and only when it is addressed here. Without both
 * checks any link could hand the extension somebody else's session.
 */
export class WebAuth implements vscode.UriHandler {
  private pendingSince: number | undefined;

  constructor(
    private readonly extensionId: string,
    private readonly context: AuthContext,
  ) {}

  private get pending(): boolean {
    return this.pendingSince !== undefined && Date.now() - this.pendingSince < PENDING_TIMEOUT_MS;
  }

  /** Opens LeetCode's authorisation page in the browser. */
  async start(): Promise<void> {
    const scheme = vscode.env.uriScheme;
    const target = vscode.Uri.parse(
      `${ORIGIN}/authorize-login/${encodeURIComponent(scheme)}/?path=${encodeURIComponent(this.extensionId)}`,
    );

    this.pendingSince = Date.now();
    log.info(`Started web authorisation for ${scheme}://${this.extensionId}`);

    const opened = await vscode.env.openExternal(target);
    if (!opened) {
      this.pendingSince = undefined;
      await offerCookieInstead('Could not open the browser for authorisation.');
      return;
    }

    void vscode.window.showInformationMessage(
      'Authorise in the browser; VS Code will pick up the session automatically.',
    );
  }

  /** Receives the redirect from the browser. */
  async handleUri(uri: vscode.Uri): Promise<void> {
    if (uri.authority.toLowerCase() !== this.extensionId.toLowerCase()) {
      log.error(`Ignored a callback addressed to ${uri.authority}`);
      return;
    }
    if (!this.pending) {
      // Either nothing was started, or it was started long enough ago that this
      // is unlikely to belong to the same attempt.
      log.error('Ignored an authorisation callback that nothing had asked for');
      void vscode.window.showWarningMessage(
        'A LeetCode authorisation arrived that VS Code had not asked for, so it was ignored.',
      );
      return;
    }
    this.pendingSince = undefined;

    const cookie = new URLSearchParams(uri.query).get('cookie');
    if (cookie === null || cookie === '') {
      log.error('Authorisation callback carried no cookie');
      await offerCookieInstead('LeetCode did not hand back a session.');
      return;
    }

    log.info('Authorisation callback received');
    await applyCookieString(this.context, cookie);
  }
}
