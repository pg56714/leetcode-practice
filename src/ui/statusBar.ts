import * as vscode from 'vscode';
import type { UserStatus } from '../leetcode/types';

/**
 * Status bar entry showing who is signed in.
 *
 * Doubles as the sign-in affordance: signed out, clicking it starts the flow,
 * so the command is reachable without hunting through the palette.
 */
export class StatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.render(undefined);
    this.item.show();
  }

  render(status: UserStatus | undefined): void {
    if (status?.signedIn) {
      this.item.text = `$(account) ${status.username}`;
      this.item.tooltip = status.premium
        ? 'LeetCode Practice — signed in (Premium)'
        : 'LeetCode Practice — signed in';
      this.item.command = 'leetcodePractice.signOut';
    } else {
      this.item.text = '$(account) LeetCode: signed out';
      this.item.tooltip = 'Sign in to LeetCode';
      this.item.command = 'leetcodePractice.signIn';
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
