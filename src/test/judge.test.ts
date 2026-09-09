import { describe, expect, test } from 'bun:test';
import { isSettled, readResult } from '../leetcode/judge';
import payloads from './fixtures/judge-payloads.json';

/**
 * These payloads were recorded from real runs against two-sum, which is why
 * they are worth asserting against: every field name and every quirk here came
 * back from LeetCode rather than from a guess about what it might send.
 */
describe('readResult', () => {
  test('a test run that answered wrongly is not accepted, whatever status_msg says', () => {
    // The trap: LeetCode reports "Accepted" for any test run that merely ran.
    expect(payloads['test-wrong-answer'].status_msg).toBe('Accepted');

    const result = readResult(payloads['test-wrong-answer']);
    expect(result.accepted).toBe(false);
    expect(result.verdict).toBe('Wrong Answer');
    expect(result.totalCorrect).toBe(0);
    expect(result.totalTestcases).toBe(2);
  });

  test('an empty solution body reads as a wrong answer, not a crash', () => {
    const result = readResult(payloads['test-empty-body']);
    expect(result.ran).toBe(true);
    expect(result.accepted).toBe(false);
    expect(result.answers).toEqual(['null', 'null']);
    expect(result.expected).toEqual(['[0,1]', '[1,2]']);
  });

  test('per-case arrays lose the trailing blank LeetCode appends', () => {
    // Two cases were sent, three slots came back.
    expect(payloads['test-correct'].code_answer).toHaveLength(3);
    expect(payloads['test-correct'].code_answer.at(-1)).toBe('');

    const result = readResult(payloads['test-correct']);
    expect(result.answers).toEqual(['[0,1]', '[1,2]']);
    expect(result.expected).toEqual(['[0,1]', '[1,2]']);
  });

  test('a correct test run is accepted with its timings', () => {
    const result = readResult(payloads['test-correct']);
    expect(result.accepted).toBe(true);
    expect(result.verdict).toBe('Accepted');
    expect(result.totalCorrect).toBe(2);
    expect(result.runtime).toBe('0 ms');
    expect(result.memory).toBe('19.4 MB');
  });

  test('a Python syntax error arrives as a runtime error that never ran', () => {
    const result = readResult(payloads['test-syntax-error']);
    expect(result.ran).toBe(false);
    expect(result.verdict).toBe('Runtime Error');
    expect(result.runtimeError).toContain('SyntaxError');
    expect(result.compileError).toBeUndefined();
  });

  test('runtime and memory of "N/A" are dropped rather than shown', () => {
    expect(payloads['test-syntax-error'].status_runtime).toBe('N/A');

    const result = readResult(payloads['test-syntax-error']);
    expect(result.runtime).toBeUndefined();
    expect(result.memory).toBeUndefined();
  });

  test('a submission means what status_msg says, having no correct_answer', () => {
    expect('correct_answer' in payloads['submit-correct']).toBe(false);

    const result = readResult(payloads['submit-correct']);
    expect(result.accepted).toBe(true);
    expect(result.totalCorrect).toBe(65);
    expect(result.totalTestcases).toBe(65);
  });

  test('a rejected submission names its failing case, argments on one line', () => {
    const result = readResult(payloads['submit-wrong-answer']);
    expect(result.accepted).toBe(false);
    expect(result.verdict).toBe('Wrong Answer');
    // input_formatted, not last_testcase's one-per-line form.
    expect(result.failedInput).toBe('[2,7,11,15], 9');
    expect(result.failedExpected).toBe('[0,1]');
    expect(result.failedActual).toBe('[9,9]');
  });

  test('an empty payload does not throw', () => {
    const result = readResult({});
    expect(result.verdict).toBe('Unknown result');
    expect(result.accepted).toBe(false);
  });
});

describe('isSettled', () => {
  test('is false while the judge is still working', () => {
    expect(isSettled({ state: 'PENDING' })).toBe(false);
    expect(isSettled({ state: 'STARTED' })).toBe(false);
  });

  test('is true for every recorded payload, which had all finished', () => {
    for (const payload of Object.values(payloads)) {
      expect(isSettled(payload)).toBe(true);
    }
  });
});
