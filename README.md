# LeetCode Practice

*English · [繁體中文](README.zh-TW.md)*

A VS Code extension for practising LeetCode, built around spaced repetition:
problem folders lead with the problem number, so they pair with an
[archive and review workflow](https://github.com/MyTeamAce/leetcode) that decides
what to redo and when.

> Written from scratch — not a fork of any existing extension. Inspired by
> [Ayanrocks/better-leetcode](https://github.com/Ayanrocks/better-leetcode), but
> sharing none of its code.

## What works today

### Signing in

Click the status bar or the sidebar and LeetCode opens in your browser; once
you authorise there, VS Code picks the session up on its own. Nothing to copy.

Credentials live in VS Code's secret storage, scoped to this extension, so they
never reach a settings file. **They are checked against LeetCode before being
stored**, so a bad or expired session fails immediately rather than at the first
submission.

Because the handoff returns the session in a URL, a callback is accepted only
while an authorisation started here is still open (five minutes), only when
addressed to this extension, and only once. Otherwise any link could hand the
extension somebody else's session.

<details>
<summary><b>Signing in with a cookie instead</b></summary>

Run **LeetCode Practice: Sign In with Cookie** from the command palette. It is
the way in for anywhere the browser handoff cannot reach: a `vscode://` scheme
the OS has not registered, Remote SSH or a dev container where the callback has
to cross a machine boundary, VS Code on the web, or LeetCode changing its
authorisation page.

1. Sign in to <https://leetcode.com> in your browser
2. Open DevTools (F12) and go to the **Network** tab
3. Reload the page, click any request to `leetcode.com`, and find
   **Request Headers → Cookie**
4. Copy that whole line and paste it in

The line is long and holds far more than is needed; only these two are read, and
they can be pasted on their own in either order:

```
LEETCODE_SESSION=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; csrftoken=8kZQ2nR7...
```

Sessions expire after a few weeks, at which point Test and Submit start failing
with "the session may have expired" and you sign in again.

</details>

### The sidebar

- **Daily Challenge** — today's problem, one row
- **Problems** — the whole set, over 4,000 problems, searchable. The list is
  cached on disk and only refetched in the background once it is a week old.
  Unfiltered it renders the first 500 rows, because nobody scrolls four thousand
  and search is the way in. A numeric query matches the number by prefix, so
  typing `17` surfaces 17, 170 and 171 rather than being buried by the 1700s.

### Icons: colour is difficulty, shape is progress

One glyph answers both "how hard" and "have I done this":

| State | Icon | Colour |
| --- | --- | --- |
| Untouched | hollow circle | green Easy / yellow Medium / red Hard |
| Attempted, not solved | filled circle | as above |
| Solved | tick in a circle | as above |
| Premium | padlock | as above |

Colours come from VS Code's `charts.green` / `yellow` / `red`, so they follow
the reader's theme instead of hardcoding hex values.

### Opening a problem

A folder appears under `storagePath`, named `<number>-<titleSlug>`:

```
3028-ant-on-the-boundary/
├─ main.py           # LeetCode's template
├─ testcases.txt     # every example case
└─ .metadata.json    # both ids, language, lines per test case
```

The code opens in the editor and the statement opens beside it without taking
focus, so the cursor lands where the typing happens.

- **Reopening a problem never overwrites work.** An existing `main.*` or
  `testcases.txt` is left exactly as it was.
- Python templates get the typing imports **they actually reference**. LeetCode
  serves `def twoSum(self, nums: List[int])` with no import, and since Python
  evaluates annotations at definition time, that file raises `NameError` when run
  locally. Only mentioned names are imported: `two-sum` gets `List`,
  `add-two-numbers` gets `Optional`, `reverse-integer` gets nothing.
- The statement panel loads no scripts, behind a content security policy that
  allows inline styles and remote images only.

### Testing and submitting

With a solution file open, `Ctrl+;` runs it against the cases in
`testcases.txt` and `Ctrl+Enter` submits it; both also sit as buttons in the
editor title bar. Results appear in the **LeetCode Results** panel at the
bottom, alongside Terminal and Output: verdict, timing, each case next to its
expected output, and compile or runtime errors when there are any. They sit
there rather than in an editor tab because a result is something to glance at
while the code stays on screen. A submission asks for confirmation first, since it is recorded against
the account.

The language comes from the file's own extension, not the folder's metadata: a
problem can hold `main.py` and `main.rs` at once, and the one being submitted
is the one in front of you.

**Cloudflare.** The judge endpoints are behind bot mitigation that fingerprints
the TLS handshake before reading a single header — measured on
`interpret_solution`, `submit` and `check`, all three answer 403 with
`cf-mitigated: challenge` from Node's own HTTP stack, browser headers or not.
This extension therefore sends those three requests through
[impit](https://github.com/apify/impit), which performs the handshake as Chrome
would; the same endpoints then answer from LeetCode itself. impit is a native
module, so a VSIX is platform specific.

## Settings

| Setting | What it does |
| --- | --- |
| `leetcodePractice.storagePath` | Where problem folders are created. Empty means `solutions/` under the first workspace folder. |
| `leetcodePractice.defaultLanguage` | Which language template a problem opens with (`python3`, `cpp`, `rust`, …). |

## Not yet built

- [ ] Per-problem language switching
- [ ] Study lists and contests
- [ ] Discussions

## Developing

```bash
bun install
```

```bash
bun run compile
```

F5 starts the Extension Development Host. It passes `--disable-extensions` by
default so a session exercises this extension alone, without noise or crashes
from unrelated ones.

```bash
bun run typecheck
```

```bash
bun run lint
```

Conventions and the LeetCode API behaviour found by probing are in
[CLAUDE.md](CLAUDE.md).

## Licence

MIT — see [LICENSE](LICENSE).
