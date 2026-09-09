import { log } from '../log';
import type { Session } from './session';

const ORIGIN = 'https://leetcode.com';

/**
 * Fallback User-Agent for the degraded transport.
 *
 * impit supplies its own matching the browser it impersonates, so this is only
 * ever used when impit could not be loaded.
 */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** The slice of a response the callers need, shared by both transports. */
interface RestResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

interface RestRequest {
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
}

type Transport = (url: string, request: RestRequest) => Promise<RestResponse>;

const REQUEST_TIMEOUT_MS = 20_000;

let transport: Transport | undefined;

/**
 * Resolves the transport used for the judge endpoints.
 *
 * Cloudflare fingerprints the TLS handshake before it reads a single header, so
 * Node's own stack is identifiable as a non-browser client and every judge
 * endpoint answers 403 with `cf-mitigated: challenge` — measured on
 * interpret_solution, submit and check, with and without browser headers.
 * impit performs the handshake as the impersonated browser would, and the same
 * three endpoints then answer from LeetCode itself.
 *
 * It is a native module, so it is loaded through `require` inside a try/catch
 * rather than imported at the top: a VSIX packaged without the matching
 * platform binary would otherwise throw while the extension is still
 * activating, taking every unrelated command down with it. Losing impit costs
 * only the Cloudflare workaround, so degrade to `fetch` and say why.
 */
function resolveTransport(): Transport {
  if (transport !== undefined) {
    return transport;
  }

  try {
    const { Impit } = require('impit') as typeof import('impit');
    // Without a timeout a stalled request hangs the progress notification
    // forever, which reads as a frozen extension rather than a slow network.
    const impit = new Impit({ browser: 'chrome', timeout: REQUEST_TIMEOUT_MS });
    transport = (url, request) => impit.fetch(url, request) as unknown as Promise<RestResponse>;
    log.info('Judge transport: impit');
  } catch (err) {
    log.error('impit could not be loaded; Cloudflare will probably block Test and Submit', err);
    transport = (url, request) =>
      fetch(url, {
        ...request,
        headers: { ...request.headers, 'User-Agent': USER_AGENT },
      }) as unknown as Promise<RestResponse>;
  }
  return transport;
}

/**
 * Raised when a judge request does not come back with a result.
 *
 * One type rather than a hierarchy: nothing catches these by kind, only shows
 * the message, so what matters is that each message says what to do about it.
 */
class JudgeRequestError extends Error {}

const CLOUDFLARE_MESSAGE =
  'Cloudflare is challenging LeetCode requests from this machine. ' +
  'Opening a problem in the browser once often clears it.';

/**
 * Detects a Cloudflare challenge, which arrives as a plain 403.
 *
 * Keyed on `cf-mitigated` alone: LeetCode also rejects with HTML 403s of its
 * own, and mislabelling one of those sends the reader chasing a Cloudflare
 * problem they do not have.
 */
function challenged(response: RestResponse): boolean {
  return response.headers.get('cf-mitigated') === 'challenge';
}

export class JudgeApi {
  constructor(private readonly session: Session) {}

  /** Whether there are credentials to send at all. */
  async hasCredentials(): Promise<boolean> {
    return (await this.session.read()) !== undefined;
  }

  /**
   * Headers a browser stamps on these requests.
   *
   * The Sec-Fetch trio cannot be set from page JavaScript, which is exactly why
   * their absence is a signal. The User-Agent is left to impit, which sends one
   * consistent with the TLS fingerprint it just presented.
   */
  private async headers(slug: string): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Referer: `${ORIGIN}/problems/${encodeURIComponent(slug)}/`,
      Origin: ORIGIN,
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
    };

    const credentials = await this.session.read();
    if (credentials === undefined) {
      throw new JudgeRequestError('Sign in to LeetCode first.');
    }
    headers.Cookie = `LEETCODE_SESSION=${credentials.session}; csrftoken=${credentials.csrfToken}`;
    headers['x-csrftoken'] = credentials.csrfToken;
    return headers;
  }

  private async send(
    url: string,
    slug: string,
    request: Omit<RestRequest, 'headers'>,
  ): Promise<unknown> {
    const response = await resolveTransport()(url, {
      ...request,
      headers: await this.headers(slug),
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 400);
      log.error(`${request.method} ${url} failed with HTTP ${response.status}`, body);
      if (challenged(response)) {
        throw new JudgeRequestError(CLOUDFLARE_MESSAGE);
      }
      // Measured: two judge runs in quick succession is enough to get a 429,
      // and the useful part of that is how long to wait, not the status code.
      if (response.status === 429) {
        throw new JudgeRequestError(
          'LeetCode is rate limiting judge runs. Wait a few seconds and try again.',
        );
      }
      if (response.status === 401 || response.status === 403 || response.status === 499) {
        throw new JudgeRequestError(
          `LeetCode rejected the request (HTTP ${response.status}). The session may have expired — sign in again.`,
        );
      }
      throw new JudgeRequestError(`LeetCode replied with HTTP ${response.status}`);
    }

    const text = await response.text();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new JudgeRequestError('LeetCode replied with something that was not JSON');
    }
  }

  /**
   * Runs code against test input without recording a submission.
   *
   * @returns The id to poll for the result.
   */
  async interpret(
    slug: string,
    questionId: string,
    lang: string,
    code: string,
    input: string,
  ): Promise<string> {
    const payload = (await this.send(
      `${ORIGIN}/problems/${encodeURIComponent(slug)}/interpret_solution/`,
      slug,
      {
        method: 'POST',
        body: JSON.stringify({
          lang,
          question_id: questionId,
          typed_code: code,
          data_input: input,
        }),
      },
    )) as { interpret_id?: string };

    if (payload.interpret_id === undefined) {
      throw new JudgeRequestError('LeetCode accepted the run but returned no id to poll');
    }
    return payload.interpret_id;
  }

  /**
   * Submits code as a real attempt.
   *
   * @returns The submission id to poll.
   */
  async submit(slug: string, questionId: string, lang: string, code: string): Promise<string> {
    const payload = (await this.send(
      `${ORIGIN}/problems/${encodeURIComponent(slug)}/submit/`,
      slug,
      {
        method: 'POST',
        body: JSON.stringify({ lang, question_id: questionId, typed_code: code }),
      },
    )) as { submission_id?: number | string };

    if (payload.submission_id === undefined) {
      throw new JudgeRequestError('LeetCode accepted the submission but returned no id to poll');
    }
    return String(payload.submission_id);
  }

  /** Reads the current state of a run or submission. */
  async check(slug: string, id: string): Promise<unknown> {
    return this.send(`${ORIGIN}/submissions/detail/${encodeURIComponent(id)}/check/`, slug, {
      method: 'GET',
    });
  }
}
