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

/**
 * The language slug for a solution file.
 *
 * A problem folder can hold main.py and main.rs at the same time, so the file
 * being submitted decides the language, not the folder's metadata. The metadata
 * still wins when its own language uses this extension, which is what keeps
 * .sql submitting as the dialect the reader chose rather than a guess.
 */
export function languageForExtension(filePath: string, fallback: string): string {
  const dot = filePath.lastIndexOf('.');
  const extension = dot === -1 ? '' : filePath.slice(dot + 1).toLowerCase();

  if (extension === '') {
    return fallback;
  }
  if (EXTENSION_BY_SLUG[fallback] === extension) {
    return fallback;
  }

  const match = Object.entries(EXTENSION_BY_SLUG).find(([, ext]) => ext === extension);
  return match?.[0] ?? fallback;
}
