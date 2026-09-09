# CLAUDE.md

A VS Code extension for practising LeetCode. Day-to-day usage lives in
[README.md](README.md); this file is the working agreement for tools and
collaborators.

## Language

- **Commit messages, code comments, identifiers, and this file: English**
- **README: Traditional Chinese** — it is what the human reads

## Commits

[Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): subject
```

- **type**: `feat` / `fix` / `docs` / `refactor` / `test` / `chore`
- **subject**: imperative, lower case, no trailing period
- **body**: explain **why**, not what — the diff already says what. Anything
  learned by probing the real API (behaviour, limits, traps) belongs here; for
  undocumented behaviour the commit is the only place it will ever be recorded
- Breaking changes take `type(scope)!:`
- One type per commit

## Code

- TypeScript strict, including `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`
- JSDoc on exported functions, classes and public methods. Comments explain why;
  they do not restate the code
- LF line endings, enforced by [.gitattributes](.gitattributes)
- No runtime dependencies unless something is genuinely impossible without one
  (a native TLS fingerprint, say). Every runtime dependency becomes a packaging
  and cross-platform publishing cost
- Reach for `vscode.workspace.fs` rather than node's `fs`: consistent path
  handling, and it does not tie the extension to a local filesystem

## Layout

```
src/
├─ extension.ts        # activate: wire dependencies, register commands and views
├─ log.ts              # single output channel, created lazily
├─ leetcode/
│   ├─ session.ts      # credentials, secret storage, cookie parsing
│   ├─ api.ts          # GraphQL and REST calls
│   ├─ queries.ts      # GraphQL documents
│   ├─ catalogue.ts    # problem set cache in globalStorage
│   └─ types.ts        # domain types
├─ views/              # TreeDataProviders
└─ ui/                 # status bar and friends
```

## Known LeetCode API behaviour

Found by probing. None of it appears in any official documentation:

- **A page caps at 100 rows**, whatever `limit` asks for. The full set of 4,046
  problems therefore takes 41 requests
- `questionFrontendId` is the number shown on the website (e.g. 3028);
  `questionId` is the internal id (e.g. 3311). **The submit API wants the
  internal one**, display and naming want the frontend one, and the two are not
  interchangeable
- Signed out, `userStatus.isPremium` comes back `null` rather than `false`
- A problem's `status` (solved or not) is only populated for a request carrying
  valid cookies; anonymously it is always `null`
- The judge endpoints (`interpret_solution`, `submit`, `check`) sit behind bot
  mitigation that fingerprints the TLS handshake. Node's own fetch gets 403 with
  `cf-mitigated: challenge` on all three, browser headers or not
- **A test run reports `status_msg: "Accepted"` whenever the code merely ran**,
  whatever it returned. Correctness lives in `correct_answer` (test runs only)
  and `total_correct`. A submission carries no `correct_answer` and does mean
  what `status_msg` says
- Per-case arrays (`code_answer`, `expected_code_answer`, `std_output_list`)
  carry one trailing empty entry beyond the number of cases
- Python syntax errors come back as `Runtime Error` with `full_runtime_error`,
  not as a compile error
- `code_output` is an array on a test run and a string on a submission;
  `std_output_list` (array) becomes `std_output` (string) the same way
- A submission answers with `last_testcase` and `expected_output` instead of the
  per-case arrays, empty when nothing failed
- Two judge runs in quick succession is enough for a 429
- A failed submission also carries `input_formatted`, the failing case with its
  arguments on one line ("[2,7,11,15], 9"), which reads better than
  `last_testcase`'s one-per-line form
- Study plans answer with their own conventions: `difficulty` upper case
  ("EASY"), `status` as "TO_DO" or "PAST_SOLVED" rather than null or "ac", and
  `paidOnly` rather than `isPaidOnly`. Normalise at the boundary
- **There is no working query for listing study plans.** `studyPlansV2ByCatalog`
  takes `catalogSlug: String!` and answers zero for every slug tried, and
  introspection is disabled ("Query unavailable"), so plans have to be named.
  These nine resolve through `studyPlanV2Detail`: top-interview-150,
  leetcode-75, top-100-liked, top-sql-50, programming-skills,
  dynamic-programming, graph-theory, binary-search, 30-days-of-javascript
- The reader's own lists **do** have a listing query:
  `myCreatedFavoriteList` and `myCollectedFavoriteList`, with opaque hash slugs.
  Their problems come from `favoriteQuestionList(favoriteSlug:)`, which pages on
  `hasMore`. A study plan slug does not work there — a plan is not a list
- `pastContests(pageNo:, numPerPage:)` lists finished contests (714 of them) and
  `contest(titleSlug:)` gives their problems with `credit` but no frontend number
  or difficulty. Past contests are the practisable ones; upcoming have no
  problems yet
- Community solutions: `questionSolutions(filters: { questionSlug, first, skip,
  orderBy })` where orderBy is a **lower case** enum literal (`most_votes`), and
  `voteCount` sits on `post` rather than the topic. One article comes from
  `topic(id: Int!)`
- **Post bodies are escaped Markdown**: newlines arrive as the two characters
  backslash-n and backslashes are doubled, so a 7,888 character post has 205
  literal escapes and no real line breaks. `JSON.parse` cannot undo it — the
  bodies contain sequences it rejects, such as a backslash before a full stop
- `question.topicId` does not exist; `boundTopicId` and `articleTopicId` do, and
  both are null for two-sum, so problem discussion cannot be reached that way
- `favoritesLists` exists but its official lists are internal oddities
  (Ascension I, Challenge I), not the plans anyone recognises
- An `interpret_id` looks like `runcode_1788854646.6059482_R6qaNhtKMm`, not a
  number, so it is a string

## Verifying

- `bun run typecheck`, `bun run lint` and `bun test` after changes
- Tests cover the pure logic — payload reading, escaping, language rules,
  normalisation — using payloads recorded from real runs as fixtures. They need
  no credentials and no network, so they run in CI
- Anything API-shaped is confirmed with a throwaway probe script under
  `scripts/` against the real API rather than by trusting the types. Those need
  a session in `.env` and stay out of the test suite. Every API fact above was
  found that way
- `.vscodeignore` does not inherit `.gitignore`. Anything secret has to be named
  in both, or it ships inside the VSIX — check with `vsce ls`
