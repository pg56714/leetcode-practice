import * as vscode from 'vscode';
import { describeError, log } from '../log';
import { type Api, PAGE_SIZE, type ProblemPage } from './api';
import { wait } from './http';
import type { ProblemSummary } from './types';

/** Bump when the cached shape changes, so old files are discarded not misread. */
const CACHE_VERSION = 1;
const CACHE_NAME = 'problems.json';

/** Refetch in the background once the cache is older than this. */
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** How many pages are in flight at once while fetching the whole set. */
const CONCURRENCY = 5;

/** How many times one page is tried before the whole fetch gives up. */
const PAGE_ATTEMPTS = 3;
/** Pause before trying a page again, multiplied by the attempt number. */
const RETRY_DELAY_MS = 1000;

type FetchProgress = vscode.Progress<{ message?: string; increment?: number }>;

export interface CatalogueOptions {
  /** Overrides RETRY_DELAY_MS, which tests have no reason to sit through. */
  retryDelayMs?: number;
}

interface CacheFile {
  version: number;
  fetchedAt: string;
  problems: ProblemSummary[];
}

/**
 * The problem set, cached on disk.
 *
 * A full fetch is 40-plus requests because LeetCode caps a page at 100 rows, so
 * it must not happen on every activation. The cache is read first and the
 * network is only touched when there is nothing stored, when it has gone stale,
 * or when the user asks.
 */
export class Catalogue {
  private problems: ProblemSummary[] = [];
  private fetchedAt: Date | undefined;
  private inFlight: Promise<void> | undefined;
  /** A fetch queued behind the one in flight, because that one became wrong. */
  private queued: Promise<void> | undefined;

  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;

  constructor(
    private readonly api: Api,
    private readonly storageDir: vscode.Uri,
    private readonly options: CatalogueOptions = {},
  ) {}

  get size(): number {
    return this.problems.length;
  }

  get age(): Date | undefined {
    return this.fetchedAt;
  }

  /**
   * Makes the catalogue usable: cache if possible, network otherwise.
   *
   * A stale cache is served immediately and refreshed behind the user's back —
   * waiting 40 requests to see a list you already have would be worse.
   */
  async prime(): Promise<void> {
    const cached = await this.readCache();
    if (cached) {
      this.problems = cached.problems;
      this.fetchedAt = new Date(cached.fetchedAt);
      this.changed.fire();
      log.info(`Loaded ${this.problems.length} problems from cache (${cached.fetchedAt})`);

      if (Date.now() - this.fetchedAt.getTime() > STALE_AFTER_MS) {
        log.info('Problem cache is stale, refreshing in the background');
        void this.refresh({ silent: true });
      }
      return;
    }
    await this.refresh({ silent: true });
  }

  /**
   * Refetches every page.
   *
   * Concurrent calls share one fetch: the view's refresh button and a
   * background staleness check can easily land at the same moment. `restart`
   * is for when the fetch in flight has become wrong rather than merely early.
   * After an account change its pages carry the previous account's solved
   * state, so one more fetch is queued behind it rather than sharing it.
   */
  async refresh(options: { silent?: boolean; restart?: boolean } = {}): Promise<void> {
    if (this.inFlight !== undefined) {
      if (options.restart === true) {
        this.queued ??= this.inFlight.then(() => {
          this.queued = undefined;
          return this.refresh({ silent: true });
        });
        return this.queued;
      }
      return this.inFlight;
    }
    this.inFlight = this.fetchAll(options.silent === true).finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async fetchAll(silent: boolean): Promise<void> {
    try {
      if (silent) {
        await this.fetchPages();
      } else {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Fetching LeetCode problems' },
          (progress) => this.fetchPages(progress),
        );
      }
    } catch (err) {
      log.error('Could not fetch the problem set', err);
      if (!silent) {
        void vscode.window.showErrorMessage(
          `Could not fetch the problem set: ${describeError(err)}`,
        );
      }
      // Keep whatever was already loaded; a failed refresh should not empty the view.
      this.changed.fire();
    }
  }

  private async fetchPages(progress?: FetchProgress): Promise<void> {
    const first = await this.page(0);
    const total = first.total;
    const collected = [...first.problems];
    const skips: number[] = [];
    for (let skip = PAGE_SIZE; skip < total; skip += PAGE_SIZE) {
      skips.push(skip);
    }
    const step = 100 / (skips.length + 1);
    progress?.report({ message: `${collected.length} / ${total}`, increment: step });

    // Five at a time, as a pool rather than in batches: a batch waits for its
    // slowest page before the next batch starts, where a pool starts the next
    // page as soon as any finishes. All forty at once would invite a 429.
    let next = 0;
    let failed = false;
    const worker = async (): Promise<void> => {
      while (!failed) {
        const skip = skips[next++];
        if (skip === undefined) {
          return;
        }
        try {
          const page = await this.page(skip);
          collected.push(...page.problems);
          progress?.report({ message: `${collected.length} / ${total}`, increment: step });
        } catch (err) {
          // The other workers finish the page they hold, then stop.
          failed = true;
          throw err;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, skips.length) }, worker));

    collected.sort((a, b) => Number(a.number) - Number(b.number));
    this.problems = collected;
    this.fetchedAt = new Date();
    await this.writeCache();
    this.changed.fire();
    log.info(`Fetched ${collected.length} of ${total} problems`);
  }

  /**
   * One page, tried again before giving up.
   *
   * Forty-one requests leave plenty of room for one to fail in passing, and
   * without a retry that one failure threw away the forty that worked.
   */
  private async page(skip: number): Promise<ProblemPage> {
    const delay = this.options.retryDelayMs ?? RETRY_DELAY_MS;
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.api.problemPage(skip);
      } catch (err) {
        if (attempt >= PAGE_ATTEMPTS) {
          throw err;
        }
        log.info(`Problem page at ${skip} failed (${describeError(err)}); trying again`);
        await wait(delay * attempt);
      }
    }
  }

  /**
   * Problems matching `query`.
   *
   * A numeric query matches the problem number by prefix, which is how someone
   * typing "17" finds 17 before 1700. Text matches title and slug.
   */
  search(query: string): ProblemSummary[] {
    const trimmed = query.trim().toLowerCase();
    if (trimmed === '') {
      return this.problems;
    }
    if (/^\d+$/.test(trimmed)) {
      return this.problems.filter((p) => p.number === trimmed || p.number.startsWith(trimmed));
    }
    return this.problems.filter(
      (p) => p.title.toLowerCase().includes(trimmed) || p.slug.includes(trimmed),
    );
  }

  private cacheUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.storageDir, CACHE_NAME);
  }

  private async readCache(): Promise<CacheFile | undefined> {
    try {
      const raw = await vscode.workspace.fs.readFile(this.cacheUri());
      const parsed = JSON.parse(new TextDecoder().decode(raw)) as CacheFile;
      if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.problems)) {
        return undefined;
      }
      return parsed;
    } catch {
      // Missing or unreadable cache is the normal first-run path, not an error.
      return undefined;
    }
  }

  private async writeCache(): Promise<void> {
    const payload: CacheFile = {
      version: CACHE_VERSION,
      fetchedAt: (this.fetchedAt ?? new Date()).toISOString(),
      problems: this.problems,
    };
    try {
      await vscode.workspace.fs.createDirectory(this.storageDir);
      await vscode.workspace.fs.writeFile(
        this.cacheUri(),
        new TextEncoder().encode(JSON.stringify(payload)),
      );
    } catch (err) {
      // Losing the cache costs a refetch, so it is not worth interrupting anyone.
      log.error('Could not write the problem cache', err);
    }
  }

  dispose(): void {
    this.changed.dispose();
  }
}
