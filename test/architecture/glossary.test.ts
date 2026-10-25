import { readdirSync, readFileSync, statSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { REPOSITORY_ROOT } from "../../scripts/shared/repository-root.ts"
import { listSourceFiles, SRC_ROOT } from "./source-file.ts"

const GLOSSARY_DIR = `${REPOSITORY_ROOT}/docs/glossary`

const OLD_NAME_TARGET_DIRS = ["docs", ".claude", "characters", "plugin", "src", "test"] as const
const OLD_NAME_TARGET_FILES = ["AGENTS.md", "README.md"] as const
const OLD_NAME_EXTENSIONS = [".ts", ".tsx", ".css", ".md", ".py", ".json"] as const
const OLD_NAME_SKIPPED_DIRS: ReadonlySet<string> = new Set([
  "docs/history",
  "docs/research",
  "node_modules",
])

describe("用語集", () => {
  it("確定の英語識別子は、どれも src/ に当たる", () => {
    const words = identifierWords("confirmed")
    const corpus = sourceCorpus()

    expect(words.length).toBeGreaterThan(0)
    expect(words.filter((word) => !appearsIn(corpus, word))).toEqual([])
  })

  it("（予定）の英語識別子（小文字だけの1語を除く）は、どれも src/ に当たらない。当たったら確定へ上げる", () => {
    const words = identifierWords("planned").filter((word) => !/^[a-z]+$/.test(word))
    const corpus = sourceCorpus()

    expect(words.length).toBeGreaterThan(0)
    expect(words.filter((word) => appearsIn(corpus, word))).toEqual([])
  })

  it("（旧称）の語は、用語集の避ける言い方の項の外に出ない", () => {
    const words = oldNames()
    const files = oldNameTargetFiles()
    const avoidLines = avoidLineKeys()

    expect(words.length).toBeGreaterThan(0)
    expect(files.length).toBeGreaterThan(0)
    expect(
      files.flatMap((file) =>
        textLinesOf(file, avoidLines).flatMap(({ lineNumber, text }) =>
          words
            .filter((word) => text.includes(word))
            .map((word) => `${file.relPath}:${lineNumber} に旧称「${word}」が残っている`),
        ),
      ),
    ).toEqual([])
  })
})

type GlossaryEntryLine = {
  readonly kind: "confirmed" | "planned" | "avoid"
  readonly file: string
  readonly lineNumber: number
  readonly continuationCount: number
  readonly text: string
}

type TargetFile = {
  readonly relPath: string
  readonly fullPath: string
}

function identifierWords(kind: "confirmed" | "planned"): readonly string[] {
  return [
    ...new Set(
      glossaryEntryLines()
        .filter((line) => line.kind === kind)
        .flatMap((line) => wordsOfIdentifierText(line.text)),
    ),
  ]
}

function oldNames(): readonly string[] {
  return [
    ...new Set(
      glossaryEntryLines()
        .filter((line) => line.kind === "avoid")
        .flatMap((line) =>
          [...line.text.matchAll(/([^、，（）\s]+)（旧称）/g)].flatMap((match) =>
            (match[1] ?? "").split("・").filter((word) => word !== ""),
          ),
        ),
    ),
  ]
}

// 項目の先頭の行（英語識別子・避ける言い方）と、続く2スペースのインデントの行を1つの項目の文字列にまとめる。
function glossaryEntryLines(): readonly GlossaryEntryLine[] {
  return readdirSync(GLOSSARY_DIR)
    .filter((name) => name.endsWith(".md"))
    .flatMap((name) => {
      const lines = readFileSync(`${GLOSSARY_DIR}/${name}`, "utf8").split("\n")
      return lines.flatMap((line, index): readonly GlossaryEntryLine[] => {
        const head = /^- \*\*(英語識別子（予定）|英語識別子|避ける言い方)\*\*: (.*)$/.exec(line)
        if (head === null) {
          return []
        }
        const kind =
          head[1] === "避ける言い方" ? "avoid" : head[1] === "英語識別子" ? "confirmed" : "planned"
        const continuation = continuationLines(lines, index)
        return [
          {
            kind,
            file: name,
            lineNumber: index + 1,
            continuationCount: continuation.length,
            text: [head[2] ?? "", ...continuation.map((next) => next.trim())].join(" "),
          },
        ]
      })
    })
}

function continuationLines(lines: readonly string[], headIndex: number): readonly string[] {
  const rest = lines.slice(headIndex + 1)
  const end = rest.findIndex((next) => !/^ {2}\S/.test(next))
  return end === -1 ? rest : rest.slice(0, end)
}

// `=` の後ろの値と「移行前は」の直後の旧い名は、識別子に数えない。
function wordsOfIdentifierText(text: string): readonly string[] {
  if (/^(なし|使わない)/.test(text)) {
    return []
  }
  const beforeEqual = (text.split("=")[0] ?? "").replace(/移行前は\s*`[^`]+`/g, "")
  return [...beforeEqual.matchAll(/`([^`]+)`/g)].flatMap((match) =>
    (match[1] ?? "").split(/[.()<>…\s]+/).filter((word) => /^[A-Za-z_][\w-]*$/.test(word)),
  )
}

function sourceCorpus(): string {
  const relPaths = listSourceFiles(SRC_ROOT, SRC_ROOT, [".ts", ".tsx", ".css"])
  return [
    ...relPaths,
    ...relPaths.map((relPath) => readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")),
  ].join("\n")
}

// camelCase・PascalCase・kebab-case の綴りの揺れは同じ語として当てる。
function appearsIn(corpus: string, word: string): boolean {
  const kebab = word.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()
  const pascal = `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`
  return [...new Set([word, pascal, kebab])].some((spelling) =>
    new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(spelling)}(?![A-Za-z0-9_])`).test(corpus),
  )
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function oldNameTargetFiles(): readonly TargetFile[] {
  return [
    ...OLD_NAME_TARGET_FILES.map((name) => ({
      relPath: name,
      fullPath: `${REPOSITORY_ROOT}/${name}`,
    })),
    ...OLD_NAME_TARGET_DIRS.flatMap((dir) => walk(dir)),
  ]
}

function walk(relDir: string): readonly TargetFile[] {
  if (OLD_NAME_SKIPPED_DIRS.has(relDir)) {
    return []
  }
  return readdirSync(`${REPOSITORY_ROOT}/${relDir}`).flatMap((name) => {
    const relPath = `${relDir}/${name}`
    if (OLD_NAME_SKIPPED_DIRS.has(name)) {
      return []
    }
    if (statSync(`${REPOSITORY_ROOT}/${relPath}`).isDirectory()) {
      return walk(relPath)
    }
    return OLD_NAME_EXTENSIONS.some((extension) => name.endsWith(extension))
      ? [{ relPath, fullPath: `${REPOSITORY_ROOT}/${relPath}` }]
      : []
  })
}

// 用語集の避ける言い方の項（先頭の行とインデントの続き）は、旧称を書く場所なので読まない。
function textLinesOf(
  file: TargetFile,
  avoidLines: ReadonlySet<string>,
): readonly { lineNumber: number; text: string }[] {
  return readFileSync(file.fullPath, "utf8")
    .split("\n")
    .flatMap((text, index) =>
      avoidLines.has(`${file.relPath}:${index + 1}`) ? [] : [{ lineNumber: index + 1, text }],
    )
}

function avoidLineKeys(): ReadonlySet<string> {
  return new Set(
    glossaryEntryLines()
      .filter((line) => line.kind === "avoid")
      .flatMap((head) =>
        Array.from(
          { length: head.continuationCount + 1 },
          (_, offset) => `docs/glossary/${head.file}:${head.lineNumber + offset}`,
        ),
      ),
  )
}
