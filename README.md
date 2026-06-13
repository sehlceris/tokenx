# tokenx

[![npm version](https://img.shields.io/npm/v/tokenx)](https://www.npmjs.com/package/tokenx)

Fast and lightweight token count estimation for any LLM without requiring a full tokenizer. This library provides quick approximations that are good enough for most use cases while keeping your bundle size minimal.

For advanced use cases requiring precise token counts, please use a full tokenizer like [`gpt-tokenizer`](https://github.com/niieani/gpt-tokenizer).

## Benchmarks

The following table shows the accuracy of the token count approximation for different input texts:

<!-- automd:file src="./docs/bench.md" -->

| Description | Actual GPT Token Count | Estimated Token Count | Token Count Deviation |
| --- | --- | --- | --- |
| Short English text | 19 | 19 | 0.00% |
| German text with umlauts | 48 | 49 | 2.08% |
| Metamorphosis by Franz Kafka (English) | 31796 | 32325 | 1.66% |
| Die Verwandlung by Franz Kafka (German) | 35309 | 33970 | 3.79% |
| 道德經 by Laozi (Chinese) | 11712 | 11427 | 2.43% |
| 羅生門 by Akutagawa Ryūnosuke (Japanese) | 9517 | 10535 | 10.70% |
| TypeScript ES5 Type Declarations (~4000 loc) | 49293 | 51599 | 4.68% |

<!-- /automd -->

## Features

- ⚡ **~95-98% accuracy** compared to full tokenizers (see benchmarks below)
- 📦 **Just 2kB** bundle size with zero dependencies
- 🌍 Multi-language support with configurable language rules
- 🗣️ Built-in support for accented characters (German, French, Spanish, Slavic languages)
- 🀄 CJK (Chinese, Japanese, Korean) character handling
- 🔧 Configurable and extensible

## Installation

Run the following command to add `tokenx` to your project.

```bash
# npm
npm install tokenx

# pnpm
pnpm add tokenx

# yarn
yarn add tokenx
```

## Usage

```ts
import { estimateTokenCount, isWithinTokenLimit, sliceByTokens, splitByTokens } from 'tokenx'

const text = 'Your text goes here.'

// Estimate the number of tokens in the text
const estimatedTokens = estimateTokenCount(text)
console.log(`Estimated token count: ${estimatedTokens}`)

// Check if text is within a specific token limit
const tokenLimit = 1024
const withinLimit = isWithinTokenLimit(text, tokenLimit)
console.log(`Is within token limit: ${withinLimit}`)

// Slice text by token positions (like Array.slice)
const firstTokens = sliceByTokens(text, 0, 5)
console.log(`First ~5 tokens: ${firstTokens}`)

// Split text into token-based chunks
const chunks = splitByTokens(text, 100)
console.log(`Split into ${chunks.length} chunks`)

// Use custom options for different languages or models
const customOptions = {
  defaultCharsPerToken: 4, // More conservative estimation
  languageConfigs: [
    { pattern: /[你我他]/g, averageCharsPerToken: 1.5 }, // Custom Chinese rule
  ]
}

const customEstimate = estimateTokenCount(text, customOptions)
console.log(`Custom estimate: ${customEstimate}`)
```

## CLI

`tokenx` ships with a command-line tool for estimating token counts of files, folders, or piped text — no install required:

```bash
# Count tokens in a single file
npx tokenx README.md

# Count every file in a folder (scanned recursively)
npx tokenx ./docs

# Count only the markdown documents in a folder, recursively
npx tokenx ./docs --ext md

# Glob patterns work too — quote them so your shell passes them through verbatim
npx tokenx "src/**/*.{ts,tsx}"

# ...or let your shell expand the glob, it works the same
npx tokenx docs/**/*.md

# Mix files, folders, and extension filters freely
npx tokenx README.md ./docs ./src --ext md --ext ts

# Pipe arbitrary text in
echo "How many tokens is this?" | npx tokenx
curl -s https://example.com | npx tokenx

# Print just the grand total (handy for scripts)
npx tokenx ./docs --ext md --total
```

Example output for a folder:

```
TOKENS  FILE
 1,722  README.md
   164  docs/bench.md
──────
 1,886  total (2 files)
```

If you use `tokenx` often, install it globally so you can drop the `npx` prefix:

```bash
npm install -g tokenx
tokenx ./docs --ext md
```

### Options

| Option | Description |
| --- | --- |
| `-e, --ext <ext>` | Only count files with this extension (repeatable, e.g. `--ext md --ext mdx`). Case-insensitive; the leading dot is optional. |
| `-j, --json` | Output results as JSON. |
| `-t, --total` | Print only the grand total token count. |
| `--no-ignore` | Include `node_modules`, `.git`, and other normally-skipped directories. |
| `-h, --help` | Show help. |
| `-v, --version` | Show the version number. |

By default, folder scans skip `node_modules` and version-control directories, and any binary files are detected and skipped automatically.

## API

### `estimateTokenCount`

Estimates the number of tokens in a given input string using heuristic rules that work across multiple languages and text types.

**Usage:**

```ts
const estimatedTokens = estimateTokenCount('Hello, world!')

// With custom options
const customEstimate = estimateTokenCount('Bonjour le monde!', {
  defaultCharsPerToken: 4,
  languageConfigs: [
    { pattern: /[éèêëàâîï]/i, averageCharsPerToken: 3 }
  ]
})
```

**Type Declaration:**

```ts
function estimateTokenCount(
  text?: string,
  options?: TokenEstimationOptions
): number

interface TokenEstimationOptions {
  /** Default average characters per token when no language-specific rule applies (default: 6) */
  defaultCharsPerToken?: number
  /** Custom language configurations to override defaults */
  languageConfigs?: LanguageConfig[]
}

interface LanguageConfig {
  /** Regular expression to detect the language */
  pattern: RegExp
  /** Average number of characters per token for this language */
  averageCharsPerToken: number
}
```

### `isWithinTokenLimit`

Checks if the estimated token count of the input is within a specified token limit.

**Usage:**

```ts
const withinLimit = isWithinTokenLimit('Check this text against a limit', 100)
// With custom options
const customCheck = isWithinTokenLimit('Text', 50, { defaultCharsPerToken: 3 })
```

**Type Declaration:**

```ts
function isWithinTokenLimit(
  text: string,
  tokenLimit: number,
  options?: TokenEstimationOptions
): boolean
```

### `sliceByTokens`

Extracts a portion of text based on token positions, similar to `Array.prototype.slice()`. Supports both positive and negative indices.

**Usage:**

```ts
const text = 'Hello, world! This is a test sentence.'

const firstThree = sliceByTokens(text, 0, 3)
const fromSecond = sliceByTokens(text, 2)
const lastTwo = sliceByTokens(text, -2)
const middle = sliceByTokens(text, 1, -1)

// With custom options
const customSlice = sliceByTokens(text, 0, 5, {
  defaultCharsPerToken: 4,
  languageConfigs: [
    { pattern: /[éèêëàâîï]/i, averageCharsPerToken: 3 }
  ]
})
```

**Type Declaration:**

```ts
function sliceByTokens(
  text: string,
  start?: number,
  end?: number,
  options?: TokenEstimationOptions
): string
```

**Parameters:**

- `text` - The input text to slice
- `start` - The start token index (inclusive). If negative, treated as offset from end. Default: `0`
- `end` - The end token index (exclusive). If negative, treated as offset from end. If omitted, slices to the end
- `options` - Token estimation options (same as `estimateTokenCount`)

**Returns:**

The sliced text portion corresponding to the specified token range.

### `splitByTokens`

Splits text into chunks based on token count. Useful for chunking documents for RAG, batch processing, or staying within context windows.

**Usage:**

```ts
const text = 'Long text that needs to be split into smaller chunks...'

// Basic splitting
const chunks = splitByTokens(text, 100)
console.log(`Split into ${chunks.length} chunks`)

// With overlap for semantic continuity
const overlappedChunks = splitByTokens(text, 100, { overlap: 10 })

// With custom options
const customChunks = splitByTokens(text, 50, {
  defaultCharsPerToken: 4,
  overlap: 5
})
```

**Type Declaration:**

```ts
interface SplitByTokensOptions extends TokenEstimationOptions {
  /** Number of tokens to overlap between consecutive chunks (default: 0) */
  overlap?: number
}

function splitByTokens(
  text: string,
  tokensPerChunk: number,
  options?: SplitByTokensOptions
): string[]
```

**Parameters:**

- `text` - The input text to split
- `tokensPerChunk` - Maximum number of tokens per chunk
- `options` - Token estimation options with optional overlap

**Returns:**

An array of text chunks, each containing approximately `tokensPerChunk` tokens.

## License

[MIT](./LICENSE) License © 2023-PRESENT [Johann Schopplich](https://github.com/johannschopplich)
