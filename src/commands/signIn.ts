import * as vscode from 'vscode';
import type { Api } from '../leetcode/api';
import { Session } from '../leetcode/session';
import type { UserStatus } from '../leetcode/types';
import { log } from '../log';
import type { StatusBar } from '../ui/statusBar';

/** Everything the sign-in flows touch. */
export interface AuthContext {
  api: Api;
  session: Session;
  statusBar: StatusBar;
  /** Called after the signed-in account changes, so views can refetch. */
  onAccountChanged: () => void;
}

/**
 * Publishes the current account to the status bar and the context key.
 *
 * The key gates the sign-in button in the view title, so it is updated even
 * when the status check itself fails: treating unknown as signed out is the
 * safe direction.
 */
export async function publishStatus(
  api: Api,
  statusBar: StatusBar,
): Promise<UserStatus | undefined> {
  let status: UserStatus | undefined;
  try {
    status = await api.userStatus();
  } catch (err) {
    log.error('Could not check the sign-in status', err);
  }
  statusBar.render(status);
  await vscode.commands.executeCommand(
    'setContext',
    'leetcodePractice.signedIn',
    status?.signedIn === true,
  );
  return status;
}

/**
 * Stores a cookie string once LeetCode confirms it works.
 *
 * Verification happens before persistence, so a stale paste fails while the
 * clipboard is still in hand rather than at the first submission an hour later.
 * Credentials that turn out to be unusable are dropped again, since keeping
 * them makes every later failure look like something else.
 */
export async function applyCookieString(context: AuthContext, raw: string): Promise<boolean> {
  const credentials = Session.parse(raw);
  if (credentials === undefined) {
    void vscode.window.showErrorMessage('Those cookies are missing LEETCODE_SESSION or csrftoken.');
    return false;
  }

  await context.session.write(credentials);
  const status = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Checking LeetCode credentials' },
    () => publishStatus(context.api, context.statusBar),
  );

  if (status?.signedIn === true) {
    void vscode.window.showInformationMessage(`Signed in to LeetCode as ${status.username}.`);
    context.onAccountChanged();
    return true;
  }

  await context.session.clear();
  await publishStatus(context.api, context.statusBar);
  void vscode.window.showErrorMessage(
    'LeetCode rejected those cookies. They may have expired — try again.',
  );
  return false;
}

/**
 * Asks for the cookie header by hand.
 *
 * The fallback for every environment the browser handoff cannot reach: a URI
 * scheme the OS has not registered, Remote SSH and containers where the
 * callback has to cross a machine boundary, VS Code on the web, or LeetCode
 * changing its authorize-login page. Those all leave a browser session intact,
 * which is all this needs.
 */
export async function signInWithPastedCookie(context: AuthContext): Promise<void> {
  const pasted = await vscode.window.showInputBox({
    title: 'LeetCode cookies',
    prompt: 'Paste the Cookie header, or just the LEETCODE_SESSION and csrftoken values',
    placeHolder: 'LEETCODE_SESSION=...; csrftoken=...',
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim() === '' || Session.parse(value)
        ? null
        : 'Both LEETCODE_SESSION and csrftoken must be present.',
  });

  if (pasted === undefined || pasted.trim() === '') {
    return;
  }
  await applyCookieString(context, pasted);
}

export async function signOut(context: AuthContext): Promise<void> {
  const confirmed = await vscode.window.showWarningMessage(
    'Sign out of LeetCode?',
    { modal: true },
    'Sign Out',
  );
  if (confirmed !== 'Sign Out') {
    return;
  }
  await context.session.clear();
  await publishStatus(context.api, context.statusBar);
  context.onAccountChanged();
  void vscode.window.showInformationMessage('Signed out of LeetCode.');
}
