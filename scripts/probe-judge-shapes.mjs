/**
 * Records what LeetCode's judge actually answers, so the result view is built
 * against real payloads instead of guesses.
 *
 * Judging needs a signed-in session, so the cookie is read from the environment
 * and never written anywhere: before the results are saved, every cookie value
 * is redacted out of them, and the file that lands on disk holds only judge
 * payloads.
 *
 * Usage (PowerShell):
 *   $env:LEETCODE_COOKIE = 'LEETCODE_SESSION=...; csrftoken=...'
 *   node scripts/probe-judge-shapes.mjs judge-shapes.json
 *
 * The fourth case is a real submission and is recorded against the account, so
 * it sends a correct solution. Set INCLUDE_FAILING_SUBMIT=1 to also submit a
 * wrong one, which is the only way to see the fields a failed submission
 * carries — at the cost of a rejected attempt on the account.
 */

import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Impit } = require('impit');

const ORIGIN = 'https://leetcode.com';
const SLUG = 'two-sum';
const QUESTION_ID = '1';
const LANG = 'python3';
const TEST_INPUT = '[2,7,11,15]\n9\n[3,2,4]\n6';

const CORRECT = `class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, n in enumerate(nums):
            if target - n in seen:
                return [seen[target - n], i]
            seen[n] = i
        return []`;

const WRONG = `class Solution:
    def twoSum(self, nums, target):
        return [9, 9]`;

const BROKEN = `class Solution:
    def twoSum(self, nums, target:
        return []`;

const EMPTY = `class Solution:
    def twoSum(self, nums, target):
        pass`;

const cookie = process.env.LEETCODE_COOKIE;
if (cookie === undefined || cookie.trim() === '') {
  console.error('Set LEETCODE_COOKIE first. In PowerShell:');
  console.error("  $env:LEETCODE_COOKIE = 'LEETCODE_SESSION=...; csrftoken=...'");
  process.exit(1);
}

/** Pulls the two values out of whatever was pasted, the way the extension does. */
function parseCookie(raw) {
  let session = '';
  let csrf = '';
  for (const match of raw.matchAll(/([A-Za-z_][\w-]*)\s*=\s*([^;\s]+)/g)) {
    const [, name, value] = match;
    if (name === 'LEETCODE_SESSION') session = value;
    if (name === 'csrftoken') csrf = value;
  }
  return { session, csrf };
}

const { session, csrf } = parseCookie(cookie);
if (session === '' || csrf === '') {
  console.error('LEETCODE_COOKIE needs both LEETCODE_SESSION and csrftoken.');
  process.exit(1);
}

// Cloudflare fingerprints the TLS handshake, so Node's own fetch cannot reach
// these endpoints at all. This is the same transport the extension uses.
const impit = new Impit({ browser: 'chrome', timeout: 20_000 });

const headers = {
  'Content-Type': 'application/json',
  Referer: `${ORIGIN}/problems/${SLUG}/`,
  Origin: ORIGIN,
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  Cookie: `LEETCODE_SESSION=${session}; csrftoken=${csrf}`,
  'x-csrftoken': csrf,
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function post(path, body) {
  const res = await impit.fetch(`${ORIGIN}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${path}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
}

async function poll(id) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const res = await impit.fetch(`${ORIGIN}/submissions/detail/${id}/check/`, {
      method: 'GET',
      headers,
    });
    const payload = JSON.parse(await res.text());
    if (payload.state !== 'PENDING' && payload.state !== 'STARTED') {
      return payload;
    }
    await wait(1500);
  }
  throw new Error('still judging after 90 seconds');
}

async function runTest(label, code) {
  process.stdout.write(`${label} … `);
  const started = await post(`/problems/${SLUG}/interpret_solution/`, {
    lang: LANG,
    question_id: QUESTION_ID,
    typed_code: code,
    data_input: TEST_INPUT,
  });
  const payload = await poll(started.interpret_id);
  console.log(payload.status_msg ?? '(no status_msg)');
  return { label, mode: 'test', started, payload };
}

async function runSubmit(label, code) {
  process.stdout.write(`${label} … `);
  const started = await post(`/problems/${SLUG}/submit/`, {
    lang: LANG,
    question_id: QUESTION_ID,
    typed_code: code,
  });
  const payload = await poll(started.submission_id);
  console.log(payload.status_msg ?? '(no status_msg)');
  return { label, mode: 'submit', started, payload };
}

const results = [];
results.push(await runTest('1. test, empty body', EMPTY));
results.push(await runTest('2. test, wrong answer', WRONG));
results.push(await runTest('3. test, syntax error', BROKEN));
results.push(await runTest('4. test, correct', CORRECT));
results.push(await runSubmit('5. submit, correct', CORRECT));

if (process.env.INCLUDE_FAILING_SUBMIT === '1') {
  results.push(await runSubmit('6. submit, wrong answer (recorded!)', WRONG));
}

// Nothing leaves here carrying a credential, whatever LeetCode echoed back.
let serialised = JSON.stringify(results, null, 2);
for (const secret of [session, csrf, cookie.trim()]) {
  if (secret.length > 6) {
    serialised = serialised.split(secret).join('<redacted>');
  }
}

const target = process.argv[2] ?? 'judge-shapes.json';
writeFileSync(target, `${serialised}\n`);
console.log(`\nWrote ${results.length} payloads to ${target}`);
console.log('Checked for cookie values before writing; none are in the file.');
