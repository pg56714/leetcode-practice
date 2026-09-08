import { log } from '../log';

/** Values a judged run can report back. */
export interface JudgeResult {
  /** LeetCode's own label, e.g. "Accepted", "Wrong Answer". */
  statusMessage: string;
  accepted: boolean;
  /** Present for a run that produced output rather than failing to build. */
  totalCorrect?: number;
  totalTestcases?: number;
  runtime?: string;
  memory?: string;
  /** Values the submitted code returned, one per case, for a test run. */
  answers?: string[];
  expected?: string[];
  /** Anything the code printed. */
  stdout?: string[];
  compileError?: string;
  runtimeError?: string;
  /** The case that failed, when LeetCode names one. */
  failedInput?: string;
  failedExpected?: string;
  failedActual?: string;
}

/** The subset of LeetCode's check payload this extension reads. */
interface CheckPayload {
  state?: string;
  status_msg?: string;
  status_code?: number;
  run_success?: boolean;
  total_correct?: number;
  total_testcases?: number;
  status_runtime?: string;
  status_memory?: string;
  code_answer?: string[];
  expected_code_answer?: string[];
  std_output_list?: string[];
  std_output?: string;
  compile_error?: string;
  full_compile_error?: string;
  runtime_error?: string;
  full_runtime_error?: string;
  last_testcase?: string;
  expected_output?: string;
  code_output?: string | string[];
}

/** True once the judge has stopped working on a submission. */
export function isSettled(payload: unknown): boolean {
  const state = (payload as CheckPayload | null)?.state;
  return state !== 'PENDING' && state !== 'STARTED';
}

/**
 * Reshapes a check payload into something a panel can render.
 *
 * The payload's shape depends on how far the run got: a compile error has no
 * answers, a wrong answer names a failing case, and an accepted submission has
 * neither. Everything is therefore optional, and the raw payload is logged so
 * an unexpected shape can be diagnosed from the output channel rather than
 * guessed at.
 */
export function readResult(payload: unknown): JudgeResult {
  log.debug('Judge payload', payload);
  const data = (payload ?? {}) as CheckPayload;

  const result: JudgeResult = {
    statusMessage: data.status_msg ?? 'Unknown result',
    accepted: data.status_msg === 'Accepted',
  };

  if (data.total_correct !== undefined) {
    result.totalCorrect = data.total_correct;
  }
  if (data.total_testcases !== undefined) {
    result.totalTestcases = data.total_testcases;
  }
  if (data.status_runtime !== undefined) {
    result.runtime = data.status_runtime;
  }
  if (data.status_memory !== undefined) {
    result.memory = data.status_memory;
  }
  if (data.code_answer !== undefined) {
    result.answers = data.code_answer;
  } else if (Array.isArray(data.code_output)) {
    result.answers = data.code_output;
  }
  if (data.expected_code_answer !== undefined) {
    result.expected = data.expected_code_answer;
  }
  if (data.std_output_list !== undefined) {
    result.stdout = data.std_output_list.filter((line) => line !== '');
  } else if (typeof data.std_output === 'string' && data.std_output !== '') {
    result.stdout = [data.std_output];
  }

  const compile = data.full_compile_error ?? data.compile_error;
  if (compile !== undefined && compile !== '') {
    result.compileError = compile;
  }
  const runtime = data.full_runtime_error ?? data.runtime_error;
  if (runtime !== undefined && runtime !== '') {
    result.runtimeError = runtime;
  }

  // A submission that fails names the offending case; a test run does not.
  if (data.last_testcase !== undefined && data.last_testcase !== '') {
    result.failedInput = data.last_testcase;
  }
  if (data.expected_output !== undefined && data.expected_output !== '') {
    result.failedExpected = data.expected_output;
  }
  if (typeof data.code_output === 'string' && data.code_output !== '') {
    result.failedActual = data.code_output;
  }

  return result;
}
