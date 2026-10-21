/**
 * Guard against accidentally committing a Supabase secret key.
 *
 * A publishable key (`sb_publishable_...`) is public by design and belongs in
 * the browser bundle. A secret key (`sb_secret_...`) is a full-access
 * credential: anyone holding it can bypass every Row Level Security policy
 * and read or write the whole database.
 *
 * This test fails the build if a secret key ever reaches the repository, and
 * if the .env file is ever committed.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..')
const gitignore = readFileSync(join(projectRoot, '.gitignore'), 'utf8')

/** A real key: the prefix plus at least 20 key characters. */
const SECRET_KEY_PATTERN = /sb_secret_[A-Za-z0-9_-]{20,}/

/**
 * A Postgres connection string that carries a password, for example
 * postgresql://postgres:hunter2@db.example.supabase.co:5432/postgres
 */
const CONNECTION_STRING_PATTERN = /postgres(?:ql)?:\/\/[^:\s@/]+:[^@\s/]+@/

const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.agents',
  '.vscode',
  '.idea',
])

function collectFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (IGNORED_DIRECTORIES.has(entry)) continue
    const full = join(directory, entry)
    if (statSync(full).isDirectory()) {
      collectFiles(full, found)
    } else {
      found.push(full)
    }
  }
  return found
}

describe('secret hygiene', () => {
  const files = collectFiles(projectRoot)

  it('finds no Supabase secret key in the repository', () => {
    const offenders: string[] = []
    for (const file of files) {
      // Skip binary files.
      if (/\.(png|jpe?g|gif|ico|woff2?|pdf|sqlite3?|db)$/i.test(file)) continue
      let contents: string
      try {
        contents = readFileSync(file, 'utf8')
      } catch {
        continue
      }
      if (SECRET_KEY_PATTERN.test(contents)) {
        offenders.push(relative(projectRoot, file))
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the .env file out of git', () => {
    expect(gitignore).toMatch(/^\.env$/m)
    expect(gitignore).toMatch(/!\.env\.example/)
  })

  it('finds no database connection string with a password', () => {
    const thisFile = fileURLToPath(import.meta.url)
    const offenders: string[] = []
    for (const file of files) {
      if (file === thisFile) continue
      if (/\.(png|jpe?g|gif|ico|woff2?|pdf|sqlite3?|db)$/i.test(file)) continue
      let contents: string
      try {
        contents = readFileSync(file, 'utf8')
      } catch {
        continue
      }
      if (CONNECTION_STRING_PATTERN.test(contents)) {
        offenders.push(relative(projectRoot, file))
      }
    }
    expect(offenders).toEqual([])
  })

  it('never puts a secret key in a VITE_ variable', () => {    const envPath = join(projectRoot, '.env')
    let contents: string
    try {
      contents = readFileSync(envPath, 'utf8')
    } catch {
      // No .env in this environment - nothing to check.
      return
    }
    for (const line of contents.split(/\r?\n/)) {
      if (!/^\s*VITE_/.test(line)) continue
      expect(line).not.toMatch(SECRET_KEY_PATTERN)
    }
  })

  it('uses the publishable key in .env, never the secret one', () => {
    const envPath = join(projectRoot, '.env')
    let contents: string
    try {
      contents = readFileSync(envPath, 'utf8')
    } catch {
      return
    }
    const keyLine = contents
      .split(/\r?\n/)
      .find((line) => /^\s*VITE_SUPABASE_PUBLISHABLE_KEY/.test(line))
    if (!keyLine) return
    const value = keyLine.split('=')[1]?.trim() ?? ''
    if (value) {
      expect(value.startsWith('sb_publishable_')).toBe(true)
    }
  })

  it('keeps the .env.example free of real values', () => {
    const example = readFileSync(join(projectRoot, '.env.example'), 'utf8')
    expect(example).not.toMatch(SECRET_KEY_PATTERN)
    for (const line of example.split(/\r?\n/)) {
      if (!/^\s*VITE_/.test(line)) continue
      const value = line.split('=')[1]?.trim() ?? ''
      expect(value).toBe('')
    }
  })

  it('never references the secret key in the frontend source', () => {
    const thisFile = fileURLToPath(import.meta.url)
    const sourceFiles = files.filter(
      (file) => file.startsWith(join(projectRoot, 'src')) && file !== thisFile,
    )
    for (const file of sourceFiles) {
      const contents = readFileSync(file, 'utf8')
      expect(contents).not.toMatch(/SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE/)
      expect(contents).not.toMatch(CONNECTION_STRING_PATTERN)
    }
  })

  it('scanned a meaningful number of files', () => {
    expect(files.length).toBeGreaterThan(30)
  })
})
