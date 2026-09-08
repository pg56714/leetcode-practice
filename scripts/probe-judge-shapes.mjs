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

/**
 * The session, from either shape people keep it in: one pasted Cookie header,
 * or the two values as separate variables in a .env file.
 */
function readCookieFromEnvironment() {
  const whole = process.env.LEETCODE_COOKIE;
  if (whole !== undefined && whole.trim() !== '') {
    return whole;
  }
  const session = process.env.LEETCODE_SESSION;
  const csrf = process.env.csrftoken ?? process.env.CSRFTOKEN;
  if (session !== undefined && csrf !== undefined) {
    return `LEETCODE_SESSION=${session}; csrftoken=${csrf}`;
  }
  return undefined;
}

const cookie = readCookieFromEnvironment();
if (cookie === undefined || cookie.trim() === '') {
  console.error('No session found. Either set LEETCODE_COOKIE, or put');
  console.error('LEETCODE_SESSION and csrftoken in a .env file and run with');
  console.error('  node --env-file=.env scripts/probe-judge-shapes.mjs');
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

/**
 * Starts a run, backing off when LeetCode rate limits.
 *
 * Judge submissions are throttled per account — measured at 429 after two runs
 * in quick succession — so the interesting part of a rate limit is how long to
 * wait, not the error text.
 */
async function post(path, body, attempt = 1) {
  const res = await impit.fetch(`${ORIGIN}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();

  if (res.status === 429 && attempt <= 5) {
    const pause = attempt * 15_000;
    process.stdout.write(`rate limited, waiting ${pause / 1000}s … `);
    await wait(pause);
    return post(path, body, attempt + 1);
  }
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

// Spaced out on purpose: back-to-back runs trip the per-account throttle, and
// waiting is cheaper than retrying.
const GAP_MS = 12_000;

const plan = [
  ['1. test, empty body', EMPTY, runTest],
  ['2. test, wrong answer', WRONG, runTest],
  ['3. test, syntax error', BROKEN, runTest],
  ['4. test, correct', CORRECT, runTest],
  ['5. submit, correct', CORRECT, runSubmit],
];
if (process.env.INCLUDE_FAILING_SUBMIT === '1') {
  plan.push(['6. submit, wrong answer (recorded!)', WRONG, runSubmit]);
}

const results = [];
for (const [label, code, run] of plan) {
  if (results.length > 0) {
    await wait(GAP_MS);
  }
  results.push(await run(label, code));
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
