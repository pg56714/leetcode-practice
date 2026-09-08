/**
 * LeetCode language slugs and the file extension each one gets.
 *
 * The slug is what the submit API expects; the extension is what makes the
 * editor pick the right grammar. SQL dialects all share `.sql`, which is why
 * this cannot be a symmetric lookup.
 */
const EXTENSION_BY_SLUG: Record<string, string> = {
  python3: 'py',
  python: 'py',
  cpp: 'cpp',
  c: 'c',
  java: 'java',
  csharp: 'cs',
  javascript: 'js',
  typescript: 'ts',
  golang: 'go',
  kotlin: 'kt',
  swift: 'swift',
  rust: 'rs',
  ruby: 'rb',
  php: 'php',
  scala: 'scala',
  elixir: 'ex',
  erlang: 'erl',
  racket: 'rkt',
  dart: 'dart',
  mysql: 'sql',
  mssql: 'sql',
  oraclesql: 'sql',
  postgresql: 'sql',
};

export function extensionFor(langSlug: string): string {
  return EXTENSION_BY_SLUG[langSlug] ?? 'txt';
}

export function isKnownLanguage(langSlug: string): boolean {
  return langSlug in EXTENSION_BY_SLUG;
}
