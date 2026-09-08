import * as vscode from 'vscode';
import { openProblem } from './commands/openProblem';
import { runSolution } from './commands/runSolution';
import {
  type AuthContext,
  publishStatus,
  signInWithPastedCookie,
  signOut,
} from './commands/signIn';
import { Api } from './leetcode/api';
import { Catalogue } from './leetcode/catalogue';
import { JudgeApi } from './leetcode/rest';
import { Session } from './leetcode/session';
import { WebAuth } from './leetcode/webAuth';
import { log } from './log';
import { StatusBar } from './ui/statusBar';
import { DailyChallengeView } from './views/dailyChallenge';
import { ProblemsView } from './views/problems';
import { ProblemPanel } from './webview/problemPanel';
import { ResultView } from './webview/resultView';
import { readMetadata } from './workspace/problemFiles';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const session = new Session(context.secrets);
  const api = new Api(session);
  const judge = new JudgeApi(session);
  const statusBar = new StatusBar();
  const catalogue = new Catalogue(api, context.globalStorageUri);

  const daily = new DailyChallengeView(api);
  const problems = new ProblemsView(catalogue);
  const problemPanel = new ProblemPanel();
  const results = new ResultView();

  const problemsView = vscode.window.createTreeView('leetcodePractice.problems', {
    treeDataProvider: problems,
  });
  problems.attach(problemsView);

  const auth: AuthContext = {
    api,
    session,
    statusBar,
    // Solved state belongs to the account, so a list cached under a different
    // one is wrong the moment the account changes.
    onAccountChanged: () => {
      void catalogue.refresh({ silent: true });
      void daily.refresh();
    },
  };
  const webAuth = new WebAuth(context.extension.id, auth);

  // The Test and Submit buttons only make sense on a file inside a problem
  // folder, which the metadata sitting next to it decides.
  const trackSolutionContext = async (editor: vscode.TextEditor | undefined): Promise<void> => {
    const metadata = editor === undefined ? undefined : await readMetadata(editor.document.uri);
    await vscode.commands.executeCommand(
      'setContext',
      'leetcodePractice.isSolution',
      metadata !== undefined,
    );
  };

  context.subscriptions.push(
    statusBar,
    daily,
    problems,
    catalogue,
    problemsView,
    problemPanel,
    { dispose: () => log.dispose() },
    vscode.window.registerUriHandler(webAuth),
    vscode.window.registerWebviewViewProvider(ResultView.viewId, results),
    vscode.window.registerTreeDataProvider('leetcodePractice.daily', daily),
    vscode.window.onDidChangeActiveTextEditor((editor) => void trackSolutionContext(editor)),
    vscode.commands.registerCommand('leetcodePractice.signIn', () => webAuth.start()),
    vscode.commands.registerCommand('leetcodePractice.signInWithCookie', () =>
      signInWithPastedCookie(auth),
    ),
    vscode.commands.registerCommand('leetcodePractice.signOut', () => signOut(auth)),
    vscode.commands.registerCommand('leetcodePractice.refreshDaily', () => daily.refresh()),
    vscode.commands.registerCommand('leetcodePractice.refreshProblems', () => catalogue.refresh()),
    vscode.commands.registerCommand('leetcodePractice.searchProblems', () =>
      problems.promptForSearch(),
    ),
    vscode.commands.registerCommand('leetcodePractice.clearProblemSearch', () =>
      problems.clearSearch(),
    ),
    vscode.commands.registerCommand('leetcodePractice.openProblem', (slug: unknown) => {
      if (typeof slug !== 'string' || slug === '') {
        log.error('openProblem was called without a problem slug');
        return undefined;
      }
      return openProblem(context, api, problemPanel, slug);
    }),
    vscode.commands.registerCommand('leetcodePractice.testSolution', () =>
      runSolution(judge, results, 'test'),
    ),
    vscode.commands.registerCommand('leetcodePractice.submitSolution', () =>
      runSolution(judge, results, 'submit'),
    ),
    vscode.commands.registerCommand('leetcodePractice.showOutput', () => log.show()),
  );

  void trackSolutionContext(vscode.window.activeTextEditor);
  await publishStatus(api, statusBar);
  void catalogue.prime();
  log.info('LeetCode Practice activated');
}

export function deactivate(): void {
  // Everything disposable is registered in context.subscriptions.
}
