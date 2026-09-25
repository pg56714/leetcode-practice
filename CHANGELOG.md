# Changelog

All notable changes to this extension are recorded here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[unreleased]: https://github.com/pg56714/leetcode-practice/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/pg56714/leetcode-practice/releases/tag/v0.1.2
[0.1.1]: https://github.com/pg56714/leetcode-practice/releases/tag/v0.1.1
[0.1.0]: https://github.com/pg56714/leetcode-practice/releases/tag/v0.1.0
