#!/usr/bin/env node
import { Buffer } from 'node:buffer'
import { glob, readFile, stat } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { estimateTokenCount } from './index.ts'

interface FileResult {
  path: string
  tokens: number
  chars: number
}

// Directories that are almost never what you want to tokenize.
const DEFAULT_IGNORED = ['node_modules', '.git', '.svn', '.hg']
// Characters that mark an argument as a glob pattern rather than a plain path.
const GLOB_MAGIC = /[*?[\]{}()!]/

const HELP = `
tokenx — fast token count estimation

USAGE
  tokenx [files|folders|globs...] [options]
  cat file.txt | tokenx

ARGUMENTS
  One or more files, folders, or glob patterns. Folders are scanned
  recursively. With no arguments, text is read from standard input.

OPTIONS
  -e, --ext <ext>    Only count files with this extension (repeatable).
                     Matching is case-insensitive; the leading dot is optional.
  -j, --json         Output results as JSON.
  -t, --total        Print only the grand total token count.
      --no-ignore    Include node_modules, .git and other normally-skipped dirs.
  -h, --help         Show this help.
  -v, --version      Show the version number.

EXAMPLES
  # A single file
  tokenx README.md

  # Every file in a folder (recursive)
  tokenx ./docs

  # All markdown documents in a folder, recursively
  tokenx ./docs --ext md

  # Glob patterns (quote them so your shell passes them through verbatim)
  tokenx "src/**/*.{ts,tsx}"

  # Or let your shell expand the glob (works the same)
  tokenx docs/**/*.md

  # Mix files, folders and extensions freely
  tokenx README.md ./docs ./src --ext md --ext ts

  # Pipe arbitrary text in
  echo "How many tokens is this?" | tokenx
  curl -s https://example.com | tokenx

  # Just the number, e.g. for scripting
  tokenx ./docs --ext md --total
`

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      'ext': { type: 'string', short: 'e', multiple: true },
      'json': { type: 'boolean', short: 'j' },
      'total': { type: 'boolean', short: 't' },
      'no-ignore': { type: 'boolean' },
      'help': { type: 'boolean', short: 'h' },
      'version': { type: 'boolean', short: 'v' },
    },
  })

  if (values.help) {
    process.stdout.write(`${HELP.trim()}\n`)
    return
  }

  if (values.version) {
    process.stdout.write(`${await readVersion()}\n`)
    return
  }

  // Normalize extension filters to a lowercase set without leading dots.
  const exts = new Set(
    (values.ext ?? []).map(e => e.replace(/^\./, '').toLowerCase()),
  )

  // No paths given → read text from stdin so the tool composes with pipes.
  if (positionals.length === 0) {
    if (process.stdin.isTTY) {
      process.stderr.write('No input. Pass a file/folder/glob, or pipe text in.\n\n')
      process.stdout.write(`${HELP.trim()}\n`)
      process.exitCode = 1
      return
    }

    const text = await readStream(process.stdin)
    const tokens = estimateTokenCount(text)

    if (values.json)
      process.stdout.write(`${JSON.stringify({ source: 'stdin', tokens, chars: text.length })}\n`)
    else if (values.total)
      process.stdout.write(`${tokens}\n`)
    else
      process.stdout.write(`${formatNumber(tokens)} tokens (stdin)\n`)
    return
  }

  const files = await collectFiles(positionals, exts, values['no-ignore'] ?? false)

  if (files.length === 0) {
    process.stderr.write('No matching files found.\n')
    process.exitCode = 1
    return
  }

  const results: FileResult[] = []
  let skipped = 0

  for (const file of files) {
    try {
      const content = await readFile(file, 'utf-8')
      // Heuristic: a NUL byte means it's almost certainly a binary file.
      if (content.includes('\0')) {
        skipped++
        continue
      }
      results.push({
        path: relative(process.cwd(), file) || file,
        tokens: estimateTokenCount(content),
        chars: content.length,
      })
    }
    catch (error) {
      process.stderr.write(`Could not read ${file}: ${(error as Error).message}\n`)
      skipped++
    }
  }

  results.sort((a, b) => b.tokens - a.tokens)
  const total = results.reduce((sum, r) => sum + r.tokens, 0)

  if (values.total) {
    process.stdout.write(`${total}\n`)
    return
  }

  if (values.json) {
    process.stdout.write(`${JSON.stringify({ files: results, total, fileCount: results.length, skipped }, null, 2)}\n`)
    return
  }

  printTable(results, total, skipped)
}

/**
 * Resolves the given inputs (files, folders, glob patterns) into a deduped,
 * sorted list of absolute file paths.
 */
async function collectFiles(
  inputs: string[],
  exts: Set<string>,
  noIgnore: boolean,
): Promise<string[]> {
  const found = new Set<string>()

  for (const input of inputs) {
    if (GLOB_MAGIC.test(input)) {
      for await (const match of glob(input)) {
        const abs = resolve(match)
        if (await isFile(abs))
          found.add(abs)
      }
      continue
    }

    const abs = resolve(input)
    let info
    try {
      info = await stat(abs)
    }
    catch {
      process.stderr.write(`No such file or folder: ${input}\n`)
      continue
    }

    if (info.isDirectory()) {
      for await (const match of glob(`${input}/**/*`)) {
        const matchAbs = resolve(match)
        if (await isFile(matchAbs))
          found.add(matchAbs)
      }
    }
    else {
      found.add(abs)
    }
  }

  return [...found]
    .filter(p => noIgnore || !DEFAULT_IGNORED.some(dir => p.includes(`/${dir}/`)))
    .filter(p => exts.size === 0 || exts.has(extensionOf(p)))
    .sort()
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  }
  catch {
    return false
  }
}

function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

function printTable(results: FileResult[], total: number, skipped: number): void {
  const tokenStrings = results.map(r => formatNumber(r.tokens))
  const totalString = formatNumber(total)
  const tokenWidth = Math.max(
    'TOKENS'.length,
    totalString.length,
    ...tokenStrings.map(s => s.length),
  )

  const lines: string[] = []
  lines.push(`${'TOKENS'.padStart(tokenWidth)}  FILE`)
  results.forEach((r, i) => {
    lines.push(`${tokenStrings[i]!.padStart(tokenWidth)}  ${r.path}`)
  })

  // Only bother with a separator + total row when there's more than one file.
  if (results.length > 1) {
    lines.push('─'.repeat(tokenWidth))
    const fileLabel = `${results.length} files`
    lines.push(`${totalString.padStart(tokenWidth)}  total (${fileLabel})`)
  }

  if (skipped > 0)
    lines.push(`\nSkipped ${skipped} ${skipped === 1 ? 'file' : 'files'} (binary or unreadable).`)

  process.stdout.write(`${lines.join('\n')}\n`)
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream)
    chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf-8')
}

async function readVersion(): Promise<string> {
  try {
    // package.json sits one level up from the built dist/cli.mjs file.
    const pkgUrl = new URL('../package.json', import.meta.url)
    const pkg = JSON.parse(await readFile(fileURLToPath(pkgUrl), 'utf-8')) as { version?: string }
    return pkg.version ?? 'unknown'
  }
  catch {
    return 'unknown'
  }
}

main().catch((error) => {
  process.stderr.write(`${(error as Error).message}\n`)
  process.exitCode = 1
})
