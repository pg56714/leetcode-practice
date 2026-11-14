import * as vscode from 'vscode';
import { extensionFor, isLanguageExtension, languageForExtension } from '../leetcode/languages';
import type { ProblemDetail } from '../leetcode/types';
import { log } from '../log';
import { completeTemplate } from './templates';

/** What a problem folder holds, and what is needed to submit from it. */
export interface ProblemMetadata {
  /** Internal id. The interpret and submit endpoints want this one. */
  questionId: string;
  /** The website's number, which also names the folder. */
  questionFrontendId: string;
  titleSlug: string;
  title: string;
  difficulty: string;
  /** Language slug of the file opened most recently, e.g. "python3". */
  lang: string;
  /**
   * The language each solution file was written in, by file name.
   *
   * The extension cannot say it alone: four SQL dialects share main.sql, and
   * python, python3 and Pandas share main.py. Folders written by older
   * versions lack it, and their files fall back to the extension.
   */
  files?: Record<string, string>;
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
function storageRoot(context: vscode.ExtensionContext): vscode.Uri {
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
function folderName(detail: ProblemDetail): string {
  return `${detail.number}-${detail.slug}`;
}

/**
 * Picks the snippet to open: the first preferred language the problem offers,
 * or whatever LeetCode lists first when it offers none of them.
 */
function pickSnippet(
  detail: ProblemDetail,
  preferred: (string | undefined)[],
): { langSlug: string; code: string } {
  for (const slug of preferred) {
    const match = detail.snippets.find((snippet) => snippet.langSlug === slug);
    if (match) {
      return { langSlug: match.langSlug, code: match.code };
    }
  }

  // Better to open something than to refuse because one language is missing.
  const first = detail.snippets[0];
  if (first === undefined) {
    throw new Error(`"${detail.title}" has no code templates at all`);
  }
  log.info(`${detail.slug} has no ${preferred[0]} template; using ${first.langSlug}`);
  return { langSlug: first.langSlug, code: first.code };
}

/** The last segment of a URI's path: "main.py" for …/1-two-sum/main.py. */
export function fileNameOf(uri: vscode.Uri): string {
  return uri.path.split('/').at(-1) ?? '';
}

/**
 * The language a solution file submits as.
 *
 * Whatever was recorded when the file was written wins. A file the metadata
 * does not list — written by an older version, or by hand — goes by its
 * extension, with the folder's language breaking the ties an extension cannot.
 */
export function fileLanguage(metadata: ProblemMetadata, fileName: string): string {
  return metadata.files?.[fileName] ?? languageForExtension(fileName, metadata.lang);
}

/**
 * Whether a file in a problem folder is a solution rather than notes or data.
 *
 * Recorded files count, as does any main.* written before files were recorded,
 * and anything in a language this extension knows, so a hand-made main2.py
 * stays testable. A notes.md beside the code does not: offering to submit it
 * would be a trap, with Ctrl+Enter one keystroke away.
 */
function isSolutionFile(metadata: ProblemMetadata, fileName: string): boolean {
  if (metadata.files?.[fileName] !== undefined || fileName.startsWith('main.')) {
    return true;
  }
  const dot = fileName.lastIndexOf('.');
  return dot !== -1 && isLanguageExtension(fileName.slice(dot + 1));
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

/** The metadata of a problem folder, or undefined when it has none. */
async function readMetadataIn(folder: vscode.Uri): Promise<ProblemMetadata | undefined> {
  try {
    const raw = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder, METADATA_NAME));
    return JSON.parse(new TextDecoder().decode(raw)) as ProblemMetadata;
  } catch {
    return undefined;
  }
}

interface OpenedProblem {
  folder: vscode.Uri;
  solution: vscode.Uri;
  /** The language the solution file is recorded as. */
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
 * refreshing it repairs folders written by older versions — except for the
 * language recorded against each existing file, which is the reader's choice.
 *
 * Opening a problem only prefers a language. `explicit` is for a deliberate
 * switch, which insists on one and is the only thing allowed to re-record a
 * file that already exists: that is how one main.sql moves between dialects.
 */
export async function createProblemFolder(
  context: vscode.ExtensionContext,
  detail: ProblemDetail,
  preferredLang: string,
  options: { explicit?: boolean } = {},
): Promise<OpenedProblem> {
  const explicit = options.explicit === true;
  const folder = vscode.Uri.joinPath(storageRoot(context), folderName(detail));
  await vscode.workspace.fs.createDirectory(folder);
  const previous = await readMetadataIn(folder);

  // After the default, whatever the folder was last opened in. A database
  // problem offers no python3, and falling through to the first snippet would
  // pick MySQL over the dialect the reader actually writes.
  const { langSlug: snippetLang, code } = pickSnippet(
    detail,
    explicit ? [preferredLang] : [preferredLang, previous?.lang],
  );
  const fileName = `main.${extensionFor(snippetLang)}`;
  const solution = vscode.Uri.joinPath(folder, fileName);
  const alreadyThere = await exists(solution);

  // A file keeps the language it was written in. Reassigning it on reopen
  // would submit a main.sql written for PostgreSQL as whichever dialect the
  // preferences happened to land on.
  const langSlug =
    alreadyThere && !explicit && previous !== undefined
      ? fileLanguage(previous, fileName)
      : snippetLang;

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
    files: { ...previous?.files, [fileName]: langSlug },
    linesPerCase: detail.linesPerCase,
    openedAt: new Date().toISOString(),
  };
  await writeText(
    vscode.Uri.joinPath(folder, METADATA_NAME),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );

  return { folder, solution, langSlug, created: !alreadyThere };
}

/**
 * Reads the metadata beside a solution file.
 *
 * Undefined when the file is not a solution: outside any problem folder, or
 * the folder's own metadata, test cases or notes.
 */
export async function readMetadata(solution: vscode.Uri): Promise<ProblemMetadata | undefined> {
  const fileName = fileNameOf(solution);
  if (fileName === METADATA_NAME || fileName === TESTCASES_NAME) {
    return undefined;
  }

  const metadata = await readMetadataIn(vscode.Uri.joinPath(solution, '..'));
  return metadata !== undefined && isSolutionFile(metadata, fileName) ? metadata : undefined;
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
