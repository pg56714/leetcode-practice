# Changelog

All notable changes to this extension are recorded here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0]

### Added

- A submission marks its problem as solved, or as attempted, straight away in
  every view that shows it, rather than at the next weekly refetch.
- A background fetch of the problem set shows a progress bar on the view.

### Changed

- **Test is now `Ctrl+Shift+Enter`** (`Cmd+Shift+Enter` on macOS), replacing
  `Ctrl+;`. Input methods such as Microsoft Bopomofo turn Ctrl plus punctuation
  into a full-width symbol, so `Ctrl+;` typed "；" instead of running the test.
- Problem statements and templates are kept for the session, so Show
  Statement and Change Language no longer refetch them.
- The cached problem list appears without waiting for the sign-in check.
- An empty `studyPlans` setting now hides the official plans instead of
  restoring the defaults, and editing the setting refreshes the view.

### Fixed

- Reopening a database problem switched its `main.sql` back to MySQL, so the
  next submission sent, say, PostgreSQL as MySQL. Each solution file now records
  the language it was written in, and only Change Language changes it.
- The case table marked a correct answer as failed when it came in another
  order, as two-sum's pair may; cases now follow the judge's per-case verdict.
- Bash and Pandas solutions get `main.sh` and `main.py` instead of `main.txt`.
- Requests to LeetCode's GraphQL endpoint give up after 20 seconds instead of
  hanging.
- Test and Submit failed until a reload once the Results view had been hidden.
- Test ignored unsaved edits to `testcases.txt`.
- Pressing Test twice sent two judge runs, the second of which LeetCode
  rate limits; a second press while a run is in progress now just says so.
- Signing in while the problem list or study lists were still loading left them
  showing signed-out progress, the problem list for a week.
- Signing in or out in another window went unnoticed until a reload.
- Double-clicking Sign In could leave the sign-in ignored: it opened two
  browser prompts, and cancelling either voided both. A second click now joins
  the first.
- One failed page threw away the whole problem-set fetch; pages are now retried.
- Notes and other non-solution files in a problem folder offered Test and Submit.
- The Problems view said "No problems cached yet" while the cache was loading
  and through the whole first fetch.

## [0.1.3]

- Upgrade the build dependency esbuild to 0.28.2 (GHSA-67mh-4wv8-2f99).

## [0.1.2]

- Remove the Marketplace Preview badge.
- Prevent test cases and metadata files from being treated as solutions.

## [0.1.1]

- Use a unique Marketplace extension name and display name for the initial publication.

## [0.1.0]

First working version.

### Added

- **Signing in** through the browser, with pasting a cookie as the fallback for
  anywhere the handoff cannot reach: Remote SSH, containers, VS Code on the web,
  or an OS that never registered the `vscode://` scheme. Credentials live in
  secret storage and are checked against LeetCode before being stored.
- **Daily Challenge** and **Problems** in the sidebar. The full set, over 4,000
  problems, is cached on disk and refetched in the background once a week —
  LeetCode caps a page at 100 rows, so a full fetch is 41 requests.
- **Study Lists**: your own lists, then LeetCode's official plans. Only the
  former can be listed by the API, so which plans to show is a setting.
- **Contests**: upcoming ones with a countdown, and the last dozen that ran.
  A finished contest expands into its problems, each opening like any other.
- **Opening a problem** creates `<number>-<slug>/` holding the template, the
  example test cases and metadata carrying both problem ids. Reopening never
  overwrites work. Python templates gain the typing imports they actually use,
  since LeetCode serves templates that would otherwise raise `NameError`.
- **Test** (`Ctrl+;`) and **Submit** (`Ctrl+Enter`), with results in a panel
  beside Terminal and Output: verdict, timings, each case against its expected
  output, and compile or runtime errors.
- **Switching language** per problem, writing the new template beside the
  existing file so a problem can hold `main.py` and `main.rs` at once.
- **Community solutions**, opened as a Markdown preview beside the code.
- Icons carrying two signals at once: colour is difficulty, shape is progress.

### Notes

- The judge endpoints sit behind bot mitigation that fingerprints the TLS
  handshake, so those three requests go through
  [impit](https://github.com/apify/impit). That makes a VSIX platform specific.
- A test run reports `status_msg: "Accepted"` whenever the code merely ran,
  whatever it returned, so correctness is read from `correct_answer` instead.

[0.2.0]: https://github.com/pg56714/leetcode-practice/releases/tag/v0.2.0
[0.1.3]: https://github.com/pg56714/leetcode-practice/releases/tag/v0.1.3
[0.1.2]: https://github.com/pg56714/leetcode-practice/releases/tag/v0.1.2
[0.1.1]: https://github.com/pg56714/leetcode-practice/releases/tag/v0.1.1
[0.1.0]: https://github.com/pg56714/leetcode-practice/releases/tag/v0.1.0
