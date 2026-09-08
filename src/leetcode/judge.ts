import { log } from '../log';

/** What a judged run reports back, in the shape the view renders. */
export interface JudgeResult {
  /** What to show as the outcome, e.g. "Accepted", "Wrong Answer". */
  verdict: string;
  accepted: boolean;
  /** False when the code failed to run at all, rather than answering wrongly. */
  ran: boolean;
  totalCorrect?: number;
  totalTestcases?: number;
  runtime?: string;
  memory?: string;
  /** What the code returned, one entry per case. Test runs only. */
  answers?: string[];
  expected?: string[];
  /** Anything the code printed. */
  stdout?: string[];
  compileError?: string;
  runtimeError?: string;
  /** The case a submission failed on. Submissions only. */
  failedInput?: string;
  failedExpected?: string;
  failedActual?: string;
}

/**
 * The fields LeetCode's check endpoint actually returns.
 *
 * Recorded from real runs rather than guessed, and the two modes answer with
 * different shapes, hence the optionality. See scripts/probe-judge-shapes.mjs.
 */
interface CheckPayload {
  state?: string;
  status_msg?: string;
  status_code?: number;
  /** False when the code could not run: syntax error, timeout, crash. */
  run_success?: boolean;
  /** Test runs only, and the only field that says whether the answer is right. */
  correct_answer?: boolean;
  total_correct?: number;
  total_testcases?: number;
  status_runtime?: string;
  status_memory?: string;
  /** Test runs: what the code returned, per case. */
  code_answer?: string[];
  expected_code_answer?: string[];
  /** Test runs: printed output, per case. */
  std_output_list?: string[];
  /** Submissions: printed output, as one string. */
  std_output?: string;
  /** An array on test runs, a string on submissions. */
  code_output?: string | string[];
  compile_error?: string;
  full_compile_error?: string;
  runtime_error?: string;
  full_runtime_error?: string;
  /** Submissions: the case that failed, empty when none did. */
  last_testcase?: string;
  /** The same case with arguments on one line, e.g. "[2,7,11,15], 9". */
  input_formatted?: string;
  expected_output?: string;
}

/** True once the judge has stopped working on a run. */
export function isSettled(payload: unknown): boolean {
  const state = (payload as CheckPayload | null)?.state;
  return state !== 'PENDING' && state !== 'STARTED';
}

/**
 * Drops the trailing empty entries LeetCode appends to its per-case arrays.
 *
 * Every recorded test run came back with one slot more than there were cases,
 * the last one empty. Rendering it would invent a case that does not exist.
 */
function trimTrailingBlank(values: string[] | undefined): string[] | undefined {
  if (values === undefined) {
    return undefined;
  }
  const trimmed = [...values];
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === '') {
    trimmed.pop();
  }
  return trimmed;
}

/**
 * Reshapes a check payload for the view.
 *
 * The thing worth knowing, learnt from real payloads: on a test run
 * `status_msg` is "Accepted" whenever the code merely ran, whatever it
 * returned — answering [9,9] to two-sum reports "Accepted" alongside
 * `correct_answer: false` and `total_correct: 0`. Correctness therefore comes
 * from `correct_answer`, and the verdict shown is computed rather than echoed.
 * Submissions carry no `correct_answer` and do mean what `status_msg` says.
 *
 * The raw payload is logged: these shapes are undocumented, so the output
 * channel is the only place a surprise can be diagnosed from.
 */
export function readResult(payload: unknown): JudgeResult {
  log.debug('Judge payload', payload);
  const data = (payload ?? {}) as CheckPayload;

  const ran = data.run_success !== false;
  const statusMessage = data.status_msg ?? 'Unknown result';
  const accepted =
    ran && (data.correct_answer === undefined ? statusMessage === 'Accepted' : data.correct_answer);

  const result: JudgeResult = {
    // Echoing "Accepted" for a test run that answered wrongly would be a lie.
    verdict: !ran || accepted ? statusMessage : 'Wrong Answer',
    accepted,
    ran,
  };

  if (data.total_correct !== undefined) {
    result.totalCorrect = data.total_correct;
  }
  if (data.total_testcases !== undefined) {
    result.totalTestcases = data.total_testcases;
  }
  // "N/A" is what a run that never executed reports; showing it is noise.
  if (data.status_runtime !== undefined && data.status_runtime !== 'N/A') {
    result.runtime = data.status_runtime;
  }
  if (data.status_memory !== undefined && data.status_memory !== 'N/A') {
    result.memory = data.status_memory;
  }

  const answers = trimTrailingBlank(data.code_answer);
  if (answers !== undefined && answers.length > 0) {
    result.answers = answers;
  }
  const expected = trimTrailingBlank(data.expected_code_answer);
  if (expected !== undefined && expected.length > 0) {
    result.expected = expected;
  }

  const printed = trimTrailingBlank(data.std_output_list) ?? [];
  if (printed.length > 0) {
    result.stdout = printed;
  } else if (typeof data.std_output === 'string' && data.std_output !== '') {
    result.stdout = [data.std_output];
  }

  const compile = data.full_compile_error ?? data.compile_error;
  if (compile !== undefined && compile !== '') {
    result.compileError = compile;
  }
  // Python syntax errors arrive as a Runtime Error rather than a compile error,
  // so this is where a broken file surfaces.
  const runtime = data.full_runtime_error ?? data.runtime_error;
  if (runtime !== undefined && runtime !== '') {
    result.runtimeError = runtime;
  }

  // input_formatted puts the arguments on one line, which reads better than
  // last_testcase's one-per-line form; it is only there on submissions.
  const failing = data.input_formatted ?? data.last_testcase;
  if (failing !== undefined && failing !== '') {
    result.failedInput = failing;
  }
  if (data.expected_output !== undefined && data.expected_output !== '') {
    result.failedExpected = data.expected_output;
  }
  if (typeof data.code_output === 'string' && data.code_output !== '') {
    result.failedActual = data.code_output;
  }

  return result;
}
