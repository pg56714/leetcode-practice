import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as vscode from 'vscode';
import { splitCases } from '../commands/runSolution';
import type { ProblemDetail } from '../leetcode/types';
import {
  createProblemFolder,
  fileLanguage,
  type ProblemMetadata,
  readMetadata,
  readTestCases,
} from '../workspace/problemFiles';
import { completeTemplate } from '../workspace/templates';
import { memoryFs } from './memoryFs';

/**
 * LeetCode's Python templates use typing names without importing them, and
 * Python evaluates annotations when a function is defined — so the file as
 * served raises NameError before any code runs. Only what a template actually
 * mentions is imported; this is not a standing pile of convenience imports.
 */
describe('completeTemplate', () => {
  test('imports the one name two-sum needs', () => {
    const template =
      'class Solution:\n    def twoSum(self, nums: List[int]) -> List[int]:\n        ';
    expect(completeTemplate('python3', template)).toStartWith('from typing import List\n\n');
  });

  test('does not read ListNode as a use of List', () => {
    const template = [
      '# Definition for singly-linked list.',
      '# class ListNode:',
      'class Solution:',
      '    def addTwoNumbers(self, l1: Optional[ListNode]) -> Optional[ListNode]:',
      '        ',
    ].join('\n');

    expect(completeTemplate('python3', template)).toStartWith('from typing import Optional\n\n');
  });

  test('adds nothing when a template mentions no typing names', () => {
    const template = 'class Solution:\n    def reverse(self, x: int) -> int:\n        ';
    expect(completeTemplate('python3', template)).toBe(template);
  });

  test('leaves a template that already imports typing alone', () => {
    const template =
      'from typing import List\n\nclass Solution:\n    def f(self, n: List[int]): ...';
    expect(completeTemplate('python3', template)).toBe(template);
  });

  test('touches no other language', () => {
    const rust = 'impl Solution {\n    pub fn two_sum(nums: Vec<i32>) -> Vec<i32> {}\n}';
    expect(completeTemplate('rust', rust)).toBe(rust);
  });
});

/**
 * A test case occupies one line per argument the solution takes, which comes
 * from metaData when the problem is opened. Splitting on that is what lines a
 * result up with the input that produced it.
 */
describe('splitCases', () => {
  test('splits one argument per line', () => {
    expect(splitCases('[2,3,-5]\n[3,2,-3,-4]\n[1]', 1)).toEqual(['[2,3,-5]', '[3,2,-3,-4]', '[1]']);
  });

  test('keeps a two argument case together', () => {
    expect(splitCases('[2,7,11,15]\n9\n[3,2,4]\n6', 2)).toEqual(['[2,7,11,15]\n9', '[3,2,4]\n6']);
  });

  test('ignores blank lines rather than making empty cases from them', () => {
    expect(splitCases('[1]\n\n[2]\n', 1)).toEqual(['[1]', '[2]']);
  });

  test('treats a nonsense line count as one, rather than looping forever', () => {
    expect(splitCases('[1]\n[2]', 0)).toEqual(['[1]', '[2]']);
  });

  test('has nothing to split when the file is empty', () => {
    expect(splitCases('', 2)).toEqual([]);
  });
});

const twoSumMetadata: ProblemMetadata = {
  questionId: '1',
  questionFrontendId: '1',
  titleSlug: 'two-sum',
  title: 'Two Sum',
  difficulty: 'Easy',
  lang: 'python3',
  linesPerCase: 2,
  openedAt: '2026-01-01T00:00:00.000Z',
};

/** A problem offering the given languages, each template naming its own. */
function problem(number: string, slug: string, langs: string[]): ProblemDetail {
  return {
    id: number,
    number,
    title: slug,
    slug,
    difficulty: 'Easy',
    paidOnly: false,
    content: '',
    sampleTestCase: '',
    exampleTestcases: '',
    linesPerCase: 1,
    snippets: langs.map((langSlug) => ({ lang: langSlug, langSlug, code: `template ${langSlug}` })),
    tags: [],
  };
}

describe('readMetadata', () => {
  let fs: ReturnType<typeof memoryFs>;
  beforeEach(() => {
    fs = memoryFs();
  });
  afterEach(() => fs.restore());

  test('recognises solutions but not the metadata, test cases or notes beside them', async () => {
    fs.write('C:/solutions/1-two-sum/.metadata.json', JSON.stringify(twoSumMetadata));
    const file = (name: string) => vscode.Uri.file(`C:\\solutions\\1-two-sum\\${name}`);

    expect(await readMetadata(file('main.py'))).toEqual(twoSumMetadata);
    expect(await readMetadata(file('testcases.txt'))).toBeUndefined();
    expect(await readMetadata(file('.metadata.json'))).toBeUndefined();
    // Notes get no Test or Submit button, and no Ctrl+Enter that submits them.
    expect(await readMetadata(file('notes.md'))).toBeUndefined();
  });

  test('counts a hand-made file in a known language as a solution', async () => {
    fs.write('/s/1-two-sum/.metadata.json', JSON.stringify(twoSumMetadata));
    expect(await readMetadata(vscode.Uri.file('/s/1-two-sum/attempt2.py'))).toBeDefined();
  });

  test('counts a recorded file whatever its extension', async () => {
    const metadata = { ...twoSumMetadata, files: { 'solution.txt': 'python3' } };
    fs.write('/s/1-two-sum/.metadata.json', JSON.stringify(metadata));
    expect(await readMetadata(vscode.Uri.file('/s/1-two-sum/solution.txt'))).toEqual(metadata);
  });

  test('finds nothing outside a problem folder', async () => {
    expect(await readMetadata(vscode.Uri.file('/elsewhere/main.py'))).toBeUndefined();
  });
});

describe('readTestCases', () => {
  let fs: ReturnType<typeof memoryFs>;
  const open = vscode.workspace.textDocuments as unknown as vscode.TextDocument[];
  beforeEach(() => {
    fs = memoryFs();
  });
  afterEach(() => {
    fs.restore();
    open.length = 0;
  });

  test('reads the file beside the solution', async () => {
    fs.write('/s/1-two-sum/testcases.txt', '[2,7,11,15]\n9\n');
    expect(await readTestCases(vscode.Uri.file('/s/1-two-sum/main.py'))).toBe('[2,7,11,15]\n9');
  });

  test('prefers what an open editor holds, saved or not', async () => {
    fs.write('/s/1-two-sum/testcases.txt', '[2,7,11,15]\n9\n');
    open.push({
      uri: vscode.Uri.file('/s/1-two-sum/testcases.txt'),
      getText: () => '[3,3]\n6\n',
    } as unknown as vscode.TextDocument);

    expect(await readTestCases(vscode.Uri.file('/s/1-two-sum/main.py'))).toBe('[3,3]\n6');
  });

  test('is empty rather than failing when there is no file', async () => {
    expect(await readTestCases(vscode.Uri.file('/s/1-two-sum/main.py'))).toBe('');
  });
});

/**
 * The language a file submits as.
 *
 * An extension alone cannot say: four SQL dialects share main.sql, and python
 * and python3 share main.py. Guessing wrong submits PostgreSQL as MySQL, which
 * LeetCode rejects on syntax, so what was recorded for the file decides.
 */
describe('fileLanguage', () => {
  test('what was recorded for the file wins over the folder and the extension', () => {
    const metadata = { ...twoSumMetadata, lang: 'mysql', files: { 'main.sql': 'postgresql' } };
    expect(fileLanguage(metadata, 'main.sql')).toBe('postgresql');
  });

  test('a file nothing was recorded for goes by its extension', () => {
    expect(fileLanguage(twoSumMetadata, 'main.rs')).toBe('rust');
  });

  test('and the folder language breaks the ties an extension cannot', () => {
    expect(fileLanguage({ ...twoSumMetadata, lang: 'python' }, 'main.py')).toBe('python');
  });
});

describe('createProblemFolder', () => {
  // Nothing configured and no workspace folder, so folders land in global storage.
  const context = {
    globalStorageUri: vscode.Uri.file('/storage'),
  } as unknown as vscode.ExtensionContext;
  const sql = problem('175', 'combine-two-tables', [
    // The order LeetCode lists them in, and it offers no python3.
    'mysql',
    'mssql',
    'postgresql',
    'oraclesql',
  ]);
  const sqlFolder = '/storage/solutions/175-combine-two-tables';
  const twoSum = problem('1', 'two-sum', ['cpp', 'python3', 'python', 'rust']);
  const twoSumFolder = '/storage/solutions/1-two-sum';

  let fs: ReturnType<typeof memoryFs>;
  beforeEach(() => {
    fs = memoryFs();
  });
  afterEach(() => fs.restore());

  function metadataIn(folder: string): ProblemMetadata {
    return JSON.parse(fs.read(`${folder}/.metadata.json`) ?? 'null') as ProblemMetadata;
  }

  test('reopening keeps the dialect a SQL file was written in', async () => {
    await createProblemFolder(context, sql, 'postgresql', { explicit: true });
    fs.write(`${sqlFolder}/main.sql`, 'SELECT 1;\n');

    // Opened again from the sidebar with the default left at python3, which
    // used to fall through to MySQL, the first dialect listed.
    const reopened = await createProblemFolder(context, sql, 'python3');

    expect(reopened.created).toBe(false);
    expect(reopened.langSlug).toBe('postgresql');
    expect(fileLanguage(metadataIn(sqlFolder), 'main.sql')).toBe('postgresql');
    expect(fs.read(`${sqlFolder}/main.sql`)).toBe('SELECT 1;\n');
  });

  test('a deliberate switch moves the same main.sql to another dialect', async () => {
    await createProblemFolder(context, sql, 'postgresql', { explicit: true });
    fs.write(`${sqlFolder}/main.sql`, 'SELECT 1;\n');

    const switched = await createProblemFolder(context, sql, 'oraclesql', { explicit: true });

    expect(switched.created).toBe(false);
    expect(fileLanguage(metadataIn(sqlFolder), 'main.sql')).toBe('oraclesql');
    expect(fs.read(`${sqlFolder}/main.sql`)).toBe('SELECT 1;\n');
  });

  test('a Pandas main.py beside main.sql is not mistaken for python3', async () => {
    const withPandas = problem('175', 'combine-two-tables', ['mysql', 'postgresql', 'pythondata']);
    await createProblemFolder(context, withPandas, 'postgresql', { explicit: true });
    await createProblemFolder(context, withPandas, 'pythondata', { explicit: true });

    // The extension alone would say python3, which this problem does not offer.
    const metadata = metadataIn(sqlFolder);
    expect(fileLanguage(metadata, 'main.py')).toBe('pythondata');
    expect(fileLanguage(metadata, 'main.sql')).toBe('postgresql');

    const reopened = await createProblemFolder(context, withPandas, 'python3');
    expect(reopened.langSlug).toBe('pythondata');
  });

  test('the first open of a database problem takes the first dialect listed', async () => {
    const opened = await createProblemFolder(context, sql, 'python3');
    expect(opened.created).toBe(true);
    expect(opened.langSlug).toBe('mysql');
    expect(fs.read(`${sqlFolder}/main.sql`)).toBe('template mysql\n');
  });

  test('a file keeps its language even when the folder was last opened in another', async () => {
    await createProblemFolder(context, twoSum, 'python', { explicit: true });
    await createProblemFolder(context, twoSum, 'rust', { explicit: true });

    // Back to main.py by default: it was written as Python 2 and stays so.
    const reopened = await createProblemFolder(context, twoSum, 'python3');

    expect(reopened.langSlug).toBe('python');
    expect(fileLanguage(metadataIn(twoSumFolder), 'main.py')).toBe('python');
  });

  test('a new language goes beside the old one, each file keeping its own', async () => {
    await createProblemFolder(context, twoSum, 'python3');
    await createProblemFolder(context, twoSum, 'rust', { explicit: true });

    expect(metadataIn(twoSumFolder).files).toEqual({ 'main.py': 'python3', 'main.rs': 'rust' });
    expect(metadataIn(twoSumFolder).lang).toBe('rust');
  });

  test('a folder written before files were recorded keeps submitting as it did', async () => {
    // An older version recorded only the folder's language: here Python 2.
    fs.write(`${twoSumFolder}/main.py`, 'class Solution: pass\n');
    fs.write(
      `${twoSumFolder}/.metadata.json`,
      JSON.stringify({ ...twoSumMetadata, lang: 'python' }),
    );

    await createProblemFolder(context, twoSum, 'python3');

    expect(metadataIn(twoSumFolder).files).toEqual({ 'main.py': 'python' });
    expect(fs.read(`${twoSumFolder}/main.py`)).toBe('class Solution: pass\n');
  });
});
