/**
 * Names LeetCode's Python templates use without importing them.
 *
 * A template reads `def twoSum(self, nums: List[int]) -> List[int]:` with no
 * import in sight. Python evaluates annotations when the function is defined,
 * so running that file locally raises NameError before any code runs. LeetCode's
 * own judge supplies the imports; a file on disk has to carry them.
 */
const TYPING_NAMES = [
  'List',
  'Optional',
  'Dict',
  'Set',
  'Tuple',
  'Deque',
  'DefaultDict',
  'Counter',
  'Union',
  'Any',
  'Callable',
  'Iterator',
];

/**
 * Makes a template valid in a file, without editorialising.
 *
 * Only the names the template actually mentions are imported — this is not a
 * grab bag of things that might come in handy, it is the minimum that makes
 * LeetCode's own snippet run. Every other language is passed through untouched.
 */
export function completeTemplate(langSlug: string, code: string): string {
  if (langSlug !== 'python3' && langSlug !== 'python') {
    return code;
  }
  if (code.includes('from typing import')) {
    return code;
  }

  // Written with lookarounds rather than word boundaries so the pattern needs
  // no escapes: ListNode must not count as a use of List.
  const needed = TYPING_NAMES.filter((name) =>
    new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`).test(code),
  );
  if (needed.length === 0) {
    return code;
  }
  return `from typing import ${needed.join(', ')}\n\n${code}`;
}
