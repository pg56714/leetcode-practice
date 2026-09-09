import { describe, expect, test } from 'bun:test';
import { unescapePost } from '../leetcode/solutions';

const NEWLINE = String.fromCharCode(10);
const TAB = String.fromCharCode(9);
const BACKSLASH = String.fromCharCode(92);

/**
 * Community solution bodies arrive as Markdown that has been escaped twice
 * over: newlines as the two characters backslash and n, backslashes doubled. A
 * 7,888 character article recorded from two-sum had 205 of the former and no
 * real line breaks at all, so rendering it untouched gives one endless line.
 */
describe('unescapePost', () => {
  test('turns literal backslash-n into line breaks', () => {
    expect(unescapePost(`line one${BACKSLASH}nline two`)).toBe(`line one${NEWLINE}line two`);
  });

  test('collapses doubled backslashes, which is what regexes in posts rely on', () => {
    // A post explaining `split("\\.")` arrives with four backslashes.
    expect(unescapePost(`split("${BACKSLASH}${BACKSLASH}.")`)).toBe(`split("${BACKSLASH}.")`);
  });

  test('does not read the second half of a doubled backslash as an escape', () => {
    // "\\n" means a literal backslash then the letter n, not a line break.
    expect(unescapePost(`${BACKSLASH}${BACKSLASH}n`)).toBe(`${BACKSLASH}n`);
  });

  test('undoes escaped quotes and tabs', () => {
    expect(unescapePost(`say ${BACKSLASH}"hello${BACKSLASH}"`)).toBe('say "hello"');
    expect(unescapePost(`a${BACKSLASH}tb`)).toBe(`a${TAB}b`);
  });

  test('drops carriage returns rather than leaving them in the Markdown', () => {
    expect(unescapePost(`one${BACKSLASH}r${BACKSLASH}ntwo`)).toBe(`one${NEWLINE}two`);
  });

  test('leaves text that was never escaped alone', () => {
    expect(unescapePost('nothing to undo here')).toBe('nothing to undo here');
  });

  test('handles a code fence the way a real post carries one', () => {
    const raw = [
      '```java',
      '    public int[] twoSum(int[] nums, int target) {',
      '        return new int[]{0, 1};',
      '    }',
      '```',
    ].join(`${BACKSLASH}n`);

    expect(unescapePost(raw).split(NEWLINE)).toHaveLength(5);
  });
});
