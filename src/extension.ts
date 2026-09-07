import * as vscode from 'vscode';
import { Api, ORIGIN } from './leetcode/api';
import { Catalogue } from './leetcode/catalogue';
import { Session } from './leetcode/session';
import { UserStatus } from './leetcode/types';
import { DailyChallengeView } from './views/dailyChallenge';
import { ProblemsView } from './views/problems';
import { StatusBar } from './ui/statusBar';
import { log } from './log';

/** Drives the "signed in" context key, which gates view/title buttons. */
async function publishStatus(api: Api, statusBar: StatusBar): Promise<UserStatus | undefined> {
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
 * Sign-in flow: the user pastes the Cookie header from a signed-in browser.
 *
 * The value is validated against LeetCode before being stored, so a bad paste
 * fails here rather than at the first Submit an hour later.
 */
async function signIn(
  api: Api,
  session: Session,
  statusBar: StatusBar,
  onSignedIn: () => void,
): Promise<void> {
  const start = await vscode.window.showInformationMessage(
    'Sign in to LeetCode in your browser, then copy the Cookie request header from DevTools.',
    'Open LeetCode',
    'Paste Cookie',
  );
  if (start === undefined) {
    return;
  }
  if (start === 'Open LeetCode') {
    await vscode.env.openExternal(vscode.Uri.parse(`${ORIGIN}/accounts/login/`));
  }

  const pasted = await vscode.window.showInputBox({
    title: 'LeetCode cookies',
    prompt: 'Paste the Cookie header (or just the LEETCODE_SESSION and csrftoken values)',
    placeHolder: 'LEETCODE_SESSION=…; csrftoken=…',
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) =>
      Session.parse(value) ? null : 'Both LEETCODE_SESSION and csrftoken must be present.',
  });
  if (pasted === undefined) {
    return;
  }

  const credentials = Session.parse(pasted);
  if (credentials === undefined) {
    return;
  }

  await session.write(credentials);
  const status = await publishStatus(api, statusBar);

  if (status?.signedIn === true) {
    void vscode.window.showInformationMessage(`Signed in to LeetCode as ${status.username}.`);
    onSignedIn();
    return;
  }

  // Keeping unusable credentials would make every later failure confusing.
  await session.clear();
  await publishStatus(api, statusBar);
  void vscode.window.showErrorMessage(
    'LeetCode rejected those cookies. They may have expired — copy them again.',
  );
}

async function signOut(
  api: Api,
  session: Session,
  statusBar: StatusBar,
  onSignedOut: () => void,
): Promise<void> {
  const confirmed = await vscode.window.showWarningMessage(
    'Sign out of LeetCode?',
    { modal: true },
    'Sign Out',
  );
  if (confirmed !== 'Sign Out') {
    return;
  }
  await session.clear();
  await publishStatus(api, statusBar);
  onSignedOut();
  void vscode.window.showInformationMessage('Signed out of LeetCode.');
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const session = new Session(context.secrets);
  const api = new Api(session);
  const statusBar = new StatusBar();
  const catalogue = new Catalogue(api, context.globalStorageUri);
  const daily = new DailyChallengeView(api);
  const problems = new ProblemsView(catalogue);

  const problemsView = vscode.window.createTreeView('leetcodePractice.problems', {
    treeDataProvider: problems,
  });
  problems.attach(problemsView);

  // Solved state comes from the signed-in account, so the cached list has to be
  // refetched when the account changes.
  const refetchForNewAccount = (): void => {
    void catalogue.refresh({ silent: true });
    void daily.refresh();
  };

  context.subscriptions.push(
    statusBar,
    daily,
    problems,
    catalogue,
    problemsView,
    { dispose: () => log.dispose() },
    vscode.window.registerTreeDataProvider('leetcodePractice.daily', daily),
    vscode.commands.registerCommand('leetcodePractice.signIn', () =>
      signIn(api, session, statusBar, refetchForNewAccount),
    ),
    vscode.commands.registerCommand('leetcodePractice.signOut', () =>
      signOut(api, session, statusBar, refetchForNewAccount),
    ),
    vscode.commands.registerCommand('leetcodePractice.refreshDaily', () => daily.refresh()),
    vscode.commands.registerCommand('leetcodePractice.refreshProblems', () => catalogue.refresh()),
    vscode.commands.registerCommand('leetcodePractice.searchProblems', () =>
      problems.promptForSearch(),
    ),
    vscode.commands.registerCommand('leetcodePractice.clearProblemSearch', () =>
      problems.clearSearch(),
    ),
    vscode.commands.registerCommand('leetcodePractice.showOutput', () => log.show()),
  );

  await publishStatus(api, statusBar);
  void catalogue.prime();
  log.info('LeetCode Practice activated');
}

export function deactivate(): void {
  // Everything disposable is registered in context.subscriptions.
}
