import { describe, expect, spyOn, test } from 'bun:test';
import * as vscode from 'vscode';
import { splitCases } from '../commands/runSolution';
import { readMetadata } from '../workspace/problemFiles';
import { completeTemplate } from '../workspace/templates';

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

describe('readMetadata', () => {
  test('recognizes solution files but ignores the metadata and test case files', async () => {
    const metadata = {
      questionId: '1',
      questionFrontendId: '1',
      titleSlug: 'two-sum',
      title: 'Two Sum',
      difficulty: 'Easy',
      lang: 'python3',
      linesPerCase: 2,
      openedAt: '2026-01-01T00:00:00.000Z',
    };
    const readFile = spyOn(vscode.workspace.fs, 'readFile').mockResolvedValue(
      new TextEncoder().encode(JSON.stringify(metadata)),
    );

    try {
      const file = (name: string) => vscode.Uri.file(`C:\\solutions\\1-two-sum\\${name}`);
      expect(await readMetadata(file('testcases.txt'))).toBeUndefined();
      expect(await readMetadata(file('.metadata.json'))).toBeUndefined();
      expect(await readMetadata(file('main.py'))).toEqual(metadata);
      expect(readFile).toHaveBeenCalledTimes(1);
    } finally {
      readFile.mockRestore();
    }
  });
});
