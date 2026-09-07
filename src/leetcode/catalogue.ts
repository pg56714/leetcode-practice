import * as vscode from 'vscode';
import { Api, PAGE_SIZE } from './api';
import { ProblemSummary } from './types';
import { log } from '../log';

/** Bump when the cached shape changes, so old files are discarded not misread. */
const CACHE_VERSION = 1;
const CACHE_NAME = 'problems.json';

/** Refetch in the background once the cache is older than this. */
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** How many pages are in flight at once while fetching the whole set. */
const CONCURRENCY = 5;

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

  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;

  constructor(
    private readonly api: Api,
    private readonly storageDir: vscode.Uri,
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
   * background staleness check can easily land at the same moment.
   */
  async refresh(options: { silent?: boolean } = {}): Promise<void> {
    if (this.inFlight) {
      return this.inFlight;
    }
    this.inFlight = this.fetchAll(options.silent === true).finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async fetchAll(silent: boolean): Promise<void> {
    const run = async (progress?: vscode.Progress<{ message?: string; increment?: number }>) => {
      const first = await this.api.problemPage(0);
      const total = first.total;
      const collected = [...first.problems];
      const pages: number[] = [];
      for (let skip = PAGE_SIZE; skip < total; skip += PAGE_SIZE) {
        pages.push(skip);
      }

      progress?.report({ message: `${collected.length} / ${total}` });

      // Batched rather than all at once: 40 simultaneous requests is a good way
      // to get rate limited, and sequential would take far too long.
      for (let i = 0; i < pages.length; i += CONCURRENCY) {
        const batch = pages.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map((skip) => this.api.problemPage(skip)));
        for (const page of results) {
          collected.push(...page.problems);
        }
        progress?.report({
          message: `${collected.length} / ${total}`,
          increment: (batch.length / (pages.length + 1)) * 100,
        });
      }

      collected.sort((a, b) => Number(a.number) - Number(b.number));
      this.problems = collected;
      this.fetchedAt = new Date();
      await this.writeCache();
      this.changed.fire();
      log.info(`Fetched ${collected.length} of ${total} problems`);
    };

    try {
      if (silent) {
        await run();
      } else {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Fetching LeetCode problems' },
          (progress) => run(progress),
        );
      }
    } catch (err) {
      log.error('Could not fetch the problem set', err);
      if (!silent) {
        void vscode.window.showErrorMessage(
          `Could not fetch the problem set: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      // Keep whatever was already loaded; a failed refresh should not empty the view.
      this.changed.fire();
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
      return this.problems.filter(
        (p) => p.number === trimmed || p.number.startsWith(trimmed),
      );
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
