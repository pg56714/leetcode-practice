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

## Verifying

- Run `bun run typecheck` after changes
- When touching anything API-shaped, write a throwaway probe script against the
  real API to confirm fields and behaviour rather than trusting the types. Every
  API fact above was found that way
