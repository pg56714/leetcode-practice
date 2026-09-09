import { describe, expect, test } from 'bun:test';
import { extensionFor, isKnownLanguage, languageForExtension } from '../leetcode/languages';

describe('extensionFor', () => {
  test('maps the languages that have an obvious extension', () => {
    expect(extensionFor('python3')).toBe('py');
    expect(extensionFor('cpp')).toBe('cpp');
    expect(extensionFor('rust')).toBe('rs');
    expect(extensionFor('golang')).toBe('go');
  });

  test('gives every SQL dialect the same extension', () => {
    expect(extensionFor('mysql')).toBe('sql');
    expect(extensionFor('mssql')).toBe('sql');
    expect(extensionFor('oraclesql')).toBe('sql');
    expect(extensionFor('postgresql')).toBe('sql');
  });

  test('falls back to txt rather than producing a file with no extension', () => {
    expect(extensionFor('brainfuck')).toBe('txt');
  });
});

describe('isKnownLanguage', () => {
  test('separates what LeetCode offers from what it does not', () => {
    expect(isKnownLanguage('python3')).toBe(true);
    expect(isKnownLanguage('typescript')).toBe(true);
    expect(isKnownLanguage('cobol')).toBe(false);
  });
});

/**
 * The rule that decides what a submission is sent as.
 *
 * A problem folder can hold main.py and main.rs at once, so the file being
 * submitted picks the language. That works because extensions map one to one —
 * except for SQL, where four dialects share `.sql`, and Python, where python
 * and python3 share `.py`. For those the metadata has to break the tie, or a
 * PostgreSQL solution would be submitted as MySQL and rejected on syntax.
 */
describe('languageForExtension', () => {
  test('an unambiguous extension wins over the metadata', () => {
    expect(languageForExtension('C:/x/1-two-sum/main.rs', 'python3')).toBe('rust');
    expect(languageForExtension('/home/x/1-two-sum/main.cpp', 'python3')).toBe('cpp');
  });

  test('the metadata keeps the SQL dialect that .sql cannot express', () => {
    expect(languageForExtension('C:/x/175-combine-two-tables/main.sql', 'postgresql')).toBe(
      'postgresql',
    );
    expect(languageForExtension('C:/x/175-combine-two-tables/main.sql', 'oraclesql')).toBe(
      'oraclesql',
    );
  });

  test('a .sql file whose metadata is not SQL falls back to a dialect', () => {
    // Nothing better is knowable here, so it picks the first that fits.
    expect(languageForExtension('C:/x/175-combine-two-tables/main.sql', 'python3')).toBe('mysql');
  });

  test('python and python3 are told apart by the metadata, not the extension', () => {
    expect(languageForExtension('C:/x/1-two-sum/main.py', 'python')).toBe('python');
    expect(languageForExtension('C:/x/1-two-sum/main.py', 'python3')).toBe('python3');
  });

  test('a file with no extension leaves the metadata alone', () => {
    expect(languageForExtension('C:/x/1-two-sum/main', 'python3')).toBe('python3');
  });

  test('an extension nobody knows leaves the metadata alone', () => {
    expect(languageForExtension('C:/x/1-two-sum/notes.md', 'python3')).toBe('python3');
  });
});
