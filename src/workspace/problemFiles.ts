import * as vscode from 'vscode';
import { extensionFor } from '../leetcode/languages';
import type { ProblemDetail } from '../leetcode/types';
import { log } from '../log';
import { completeTemplate } from './templates';

/** What a problem folder holds, and what phase 4 needs to submit from it. */
export interface ProblemMetadata {
  /** Internal id. The interpret and submit endpoints want this one. */
  questionId: string;
  /** The website's number, which also names the folder. */
  questionFrontendId: string;
  titleSlug: string;
  title: string;
  difficulty: string;
  /** Language slug of the file that was created, e.g. "python3". */
  lang: string;
  /** Lines one test case occupies, so test input can be split later. */
  linesPerCase: number;
  /** When this folder was created, for anyone auditing an old checkout. */
  openedAt: string;
}

const METADATA_NAME = '.metadata.json';
const TESTCASES_NAME = 'testcases.txt';

/**
 * Where problem folders live.
 *
 * The setting wins, then the first workspace folder, and global storage is the
 * last resort so that opening a problem never fails just because no folder is
 * open. Solutions the user wants to keep should not land in global storage, so
 * that case warns.
 */
export function storageRoot(context: vscode.ExtensionContext): vscode.Uri {
  const configured = vscode.workspace
    .getConfiguration('leetcodePractice')
    .get<string>('storagePath');

  if (configured !== undefined && configured.trim() !== '') {
    return vscode.Uri.file(configured);
  }

  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder) {
    return vscode.Uri.joinPath(folder.uri, 'solutions');
  }

  log.info('No workspace folder and no storagePath set; using global storage');
  return vscode.Uri.joinPath(context.globalStorageUri, 'solutions');
}

/**
 * The folder name for a problem: number first, then slug.
 *
 * Leading with the number means the folder sorts and reads the way the website
 * does, and downstream tooling never has to look the number up again.
 */
export function folderName(detail: ProblemDetail): string {
  return `${detail.number}-${detail.slug}`;
}

/** Picks the snippet for a language, falling back to whatever LeetCode offers. */
export function pickSnippet(
  detail: ProblemDetail,
  preferred: string,
): { langSlug: string; code: string } {
  const match = detail.snippets.find((snippet) => snippet.langSlug === preferred);
  if (match) {
    return { langSlug: match.langSlug, code: match.code };
  }

  // Better to open something than to refuse because one language is missing.
  const first = detail.snippets[0];
  if (first === undefined) {
    throw new Error(`"${detail.title}" has no code templates at all`);
  }
  log.info(`${detail.slug} has no ${preferred} template; using ${first.langSlug}`);
  return { langSlug: first.langSlug, code: first.code };
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function writeText(uri: vscode.Uri, text: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text));
}

export interface OpenedProblem {
  folder: vscode.Uri;
  solution: vscode.Uri;
  langSlug: string;
  /** False when the solution file was already there and was left untouched. */
  created: boolean;
}

/**
 * Creates (or reuses) the folder for a problem and returns its paths.
 *
 * An existing solution file is never overwritten: reopening a problem to look at
 * it must not destroy an attempt. Test cases are left alone too, since they are
 * worth editing by hand. Metadata is always rewritten — it is derived data, and
 * refreshing it repairs folders written by older versions.
 */
export async function createProblemFolder(
  context: vscode.ExtensionContext,
  detail: ProblemDetail,
  preferredLang: string,
): Promise<OpenedProblem> {
  const folder = vscode.Uri.joinPath(storageRoot(context), folderName(detail));
  await vscode.workspace.fs.createDirectory(folder);

  const { langSlug, code } = pickSnippet(detail, preferredLang);
  const solution = vscode.Uri.joinPath(folder, `main.${extensionFor(langSlug)}`);

  const alreadyThere = await exists(solution);
  if (!alreadyThere) {
    const template = completeTemplate(langSlug, code);
    await writeText(solution, template.endsWith('\n') ? template : `${template}\n`);
  }

  const testcases = vscode.Uri.joinPath(folder, TESTCASES_NAME);
  if (!(await exists(testcases))) {
    const cases = detail.exampleTestcases.trim();
    await writeText(testcases, cases === '' ? '' : `${cases}\n`);
  }

  const metadata: ProblemMetadata = {
    questionId: detail.id,
    questionFrontendId: detail.number,
    titleSlug: detail.slug,
    title: detail.title,
    difficulty: detail.difficulty,
    lang: langSlug,
    linesPerCase: detail.linesPerCase,
    openedAt: new Date().toISOString(),
  };
  await writeText(
    vscode.Uri.joinPath(folder, METADATA_NAME),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );

  return { folder, solution, langSlug, created: !alreadyThere };
}

/** Reads the metadata beside a solution file, or undefined when there is none. */
export async function readMetadata(solution: vscode.Uri): Promise<ProblemMetadata | undefined> {
  const metadataUri = vscode.Uri.joinPath(solution, '..', METADATA_NAME);
  try {
    const raw = await vscode.workspace.fs.readFile(metadataUri);
    return JSON.parse(new TextDecoder().decode(raw)) as ProblemMetadata;
  } catch {
    return undefined;
  }
}

/**
 * Reads the test cases beside a solution file.
 *
 * Hand edits are the point of the file existing, so whatever is in it wins;
 * an empty or missing file yields an empty string, which LeetCode rejects with
 * a clear message of its own.
 */
export async function readTestCases(solution: vscode.Uri): Promise<string> {
  const uri = vscode.Uri.joinPath(solution, '..', TESTCASES_NAME);
  try {
    const raw = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(raw).trim();
  } catch {
    return '';
  }
}
