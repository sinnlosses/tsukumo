import { readdirSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { commentLineIndexes } from "./comment-line.ts"
import { COMMENT_REFERENCE_BACKLOG } from "./comment-reference-backlog.ts"

// コメントから別の場所を、名前・置き場所が変わると古くなるもので指していないかを見る
// （docs/coding-standards.md「コメント」の「別の場所を指すとき」）。
// 見るのは `oxlint` と同じ `src` `test` `scripts` の3つで、コメントの行だけ。
//
// 規則は3つ。
// - ソースファイル名（拡張子が .ts / .tsx）を書かない。コードはシンボルの名前で指す
// - 正典の節を番号つきで指さない（節の検査は句しか照らさないので、番号は黙って古くなる）
// - 行コメントの中に link のタグを書かない（エディタが解決するのは JSDoc の中だけ）
//
// まだ揃えていないファイルは `COMMENT_REFERENCE_BACKLOG` に載っている。
// 載っていないファイルの違反と、載っているのに違反が無くなったファイルの両方で落ちる。

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "")

const SCANNED_ROOTS = ["src", "test", "scripts"] as const satisfies readonly string[]

// 置き場所そのものを検査するテストで、コメントに出るパスは指し先ではなく検査の中身。
const SOURCE_FILE_NAME_EXEMPT = new Set(["test/architecture.test.ts"])

// ディレクトリつき・相対パスつきのファイル名も1つとして拾う。
const SOURCE_FILE_NAME = /[\w./@-]*[\w-]\.tsx?(?![\w.])/g

// 指し先ではないもの。
// 型定義（外部パッケージのもの）、先頭が `.` の接尾辞（`.test.ts` のような形の話）、
// 扱うデータの形を示す例のパス（名前を foo / bar / baz にする約束）。
const NOT_A_POINTER = /\.d\.ts$|^\.[a-z]|(?:^|\/)(?:foo|bar|baz)\.tsx?$/

// コマンドとして打つ形（`bun run` のあとのスクリプト）は、指し先ではなく打つ文字列。
const COMMAND_PREFIX = /\bbun (?:run )?$/

const NUMBERED_SECTION_REFERENCE =
  /(?<![\w/.-])(?:docs\/[a-z0-9-]+(?:\/[a-z0-9-]+)*|CLAUDE|README)\.md`?[ \t]*(?:\d+(?:\.\d+)*章?|原則\d+)(?![\w.])/

const LINK_IN_LINE_COMMENT = /^\s*\/\/.*\{@link\b/

describe("コメント中の指し方", () => {
  const violatingFiles = listScannedFiles().filter(hasViolation)

  it("移行待ちの一覧に無いファイルは、コメントでファイル名・節番号・行コメントの {@link} を使わない", () => {
    const backlog = new Set<string>(COMMENT_REFERENCE_BACKLOG)
    const offenders = violatingFiles
      .filter((path) => !backlog.has(path))
      .flatMap((path) => violationsOf(path))

    expect(offenders.join("\n")).toBe("")
  })

  it("移行待ちの一覧に、もう違反の無いファイルが残っていない", () => {
    const violating = new Set(violatingFiles)
    const cleared = COMMENT_REFERENCE_BACKLOG.filter((path) => !violating.has(path))

    expect(cleared).toEqual([])
  })
})

/** `src` `test` `scripts` の下のコードとスタイルを、リポジトリ直下からの相対パスで返す。 */
function listScannedFiles(): readonly string[] {
  return SCANNED_ROOTS.flatMap((root) => listFiles(root))
}

function listFiles(relativeDirectory: string): readonly string[] {
  return readdirSync(`${REPOSITORY_ROOT}/${relativeDirectory}`).flatMap((name) => {
    const path = `${relativeDirectory}/${name}`
    if (statSync(`${REPOSITORY_ROOT}/${path}`).isDirectory()) {
      return listFiles(path)
    }
    return /\.(?:tsx?|css)$/.test(name) ? [path] : []
  })
}

function hasViolation(path: string): boolean {
  return violationsOf(path).length > 0
}

/** ファイル1つの違反を `パス:行: 中身` の形で返す。 */
function violationsOf(path: string): readonly string[] {
  const lines = readFileSync(`${REPOSITORY_ROOT}/${path}`, "utf8").split("\n")
  const checksFileName = !SOURCE_FILE_NAME_EXEMPT.has(path)
  return commentLineIndexes(lines).flatMap((index) => {
    const line = lines[index] ?? ""
    const found = [
      ...(checksFileName ? sourceFileNamesIn(line) : []),
      ...(NUMBERED_SECTION_REFERENCE.test(line) ? ["節番号つきの参照"] : []),
      ...(LINK_IN_LINE_COMMENT.test(line) ? ["// の中の {@link}"] : []),
    ]
    return found.map((what) => `${path}:${index + 1}: ${what}`)
  })
}

/** 行の中の、指し先としてのソースファイル名。「」の中（正典の句の引用）は見ない。 */
function sourceFileNamesIn(line: string): readonly string[] {
  return [...line.matchAll(SOURCE_FILE_NAME)]
    .filter((match) => !NOT_A_POINTER.test(match[0]))
    .filter((match) => !COMMAND_PREFIX.test(line.slice(0, match.index)))
    .filter((match) => !isInsideQuote(line.slice(0, match.index)))
    .map((match) => match[0])
}

function isInsideQuote(before: string): boolean {
  const opens = before.split("「").length - 1
  const closes = before.split("」").length - 1
  return opens > closes
}
