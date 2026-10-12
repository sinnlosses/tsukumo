import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { commentLineIndexes } from "../comment-line.ts"
import { listSourceFiles } from "./source-file.ts"

// コメントに特定の日付を書かない（`docs/coding-standards.md`「コメント」の表。「いつ決まったか・
// 誰が言ったか（特定の日付・「〜の指摘」「ユーザーの決定」）」は禁止で、理由（Why / Why not）は
// 残す。日付つきの記録は `docs/architecture.md` と `docs/history/` が持つ）。`oxlint` と同じ
// `src` `test` `scripts` `story` `.storybook` を見る（`package.json` の `lint`。`docs/` `.tw/` は対象外——
// ドキュメントは日付つきの記録を持つのが正しい）。
//
// コメント行は `commentLineIndexes` で拾う（`.css` の `/* */` も含む）。行の途中で開くブロック
// コメントと、行の途中にある `//` は拾わない。`test/` のフィクスチャに出てくる `date` フィールドの
// ようなテストデータの日付は、コメント行でないのでこれで自然に除外される。
// 見本のパス（`docs/history/mockup/…`）はディレクトリ名に日付を持つので、パスだけを除いて見る。
const LINTED_DIRS: readonly string[] = ["src", "test", "scripts", "story", ".storybook"]
const COMMENTED_EXTENSIONS = [".ts", ".tsx", ".css"] as const satisfies readonly string[]
const TYPESCRIPT_EXTENSIONS = [".ts", ".tsx"] as const satisfies readonly string[]
const MOCKUP_PATH = /docs\/history\/mockup\/[\w./-]*/g
const SPECIFIC_DATE = /\d{4}-\d{2}-\d{2}/

describe("コメント中の日付", () => {
  it("src / test / scripts / story / .storybook の *.ts / *.tsx / *.css で、コメント行が見本のパスの外に特定の日付（YYYY-MM-DD）を含まない", () => {
    const offenders = offendingCommentLines(COMMENTED_EXTENSIONS, (line) =>
      SPECIFIC_DATE.test(line.replace(MOCKUP_PATH, "")),
    )

    expect(offenders.join("\n")).toBe("")
  })
})

// コメントに Markdown の強調記法を使わない（`docs/coding-standards.md`「コメント」の
// 「書き方は2つ守る」）。見るのは `//` の行と、`/*` で始まる行から `*/` を含む行までの
// ブロックコメントの行だけ。
// 行頭が `*` というだけでは拾わない。システムプロンプトのテンプレートリテラル
// （`chat-manner.ts` など）は行頭が `*` の箇条書きを本文に持ち、そちらの強調は Claude に渡す文面なので対象外。
const COMMENT_EMPHASIS = /\*\*[^*]+\*\*/

describe("コメント中の強調", () => {
  it("src / test / scripts / story / .storybook の *.ts / *.tsx で、コメント行が強調（`**…**`）を含まない", () => {
    const offenders = offendingCommentLines(TYPESCRIPT_EXTENSIONS, (line) =>
      COMMENT_EMPHASIS.test(line),
    )

    expect(offenders.join("\n")).toBe("")
  })
})

const CALLER_LIST_IN_PARENS =
  /（`[^`]+`(?:\s*[・、と/]\s*`[^`]+`)*\s*(?:(?:が|から)(?:呼ぶ|使う|呼び出す)|に(?:呼ばれる|使われる))）/

describe("コメント中の呼ぶ側", () => {
  it("src / test / scripts / story / .storybook の *.ts / *.tsx で、コメント行が括弧に呼ぶ側・使う側を並べない（docs/coding-standards.md「別の場所を指すとき」）", () => {
    const offenders = offendingCommentLines(TYPESCRIPT_EXTENSIONS, (line) =>
      CALLER_LIST_IN_PARENS.test(line),
    )

    expect(offenders.join("\n")).toBe("")
  })
})

const JSDOC_OPENING_WITH_TEXT = /^\s*\/\*\* \S/

describe("複数行の JSDoc の書き出し", () => {
  it("src / test / scripts / story / .storybook の *.ts / *.tsx で、複数行の JSDoc が `/**` だけの行で書き出される（docs/coding-standards.md「コメント」）", () => {
    const offenders = offendingCommentLines(
      TYPESCRIPT_EXTENSIONS,
      (line) => JSDOC_OPENING_WITH_TEXT.test(line) && !line.includes("*/"),
    )

    expect(offenders.join("\n")).toBe("")
  })
})

const ANNOTATED_RECORD_CONSTANT =
  /^[ \t]*(?:export[ \t]+)?const[ \t]+(\w+)[ \t]*:[ \t]*(?:(?:Readonly|Partial)<\s*)*Record<\s*(?!string\b|number\b)[^,<>]+,(?!\s*(?:Readonly(?:Set|Array|Map)<|readonly\s))/gm

describe("定数の Record の型注釈", () => {
  it("src / test / scripts / story / .storybook の *.ts / *.tsx で、キーが string・number でなく値が読み取り専用の入れ物でない Record を定数の型注釈に書かない（docs/coding-standards.md「型注釈より `satisfies`」）", () => {
    const offenders = lintedFiles(TYPESCRIPT_EXTENSIONS)
      .filter(({ path }) => !path.endsWith(".d.ts"))
      .flatMap(({ path, lines }) => {
        const commentLines = new Set(commentLineIndexes(lines))
        const code = lines.map((line, index) => (commentLines.has(index) ? "" : line)).join("\n")
        return [...code.matchAll(ANNOTATED_RECORD_CONSTANT)].map(
          (match) => `${path}:${code.slice(0, match.index).split("\n").length}: ${match[1]}`,
        )
      })

    expect(offenders.join("\n")).toBe("")
  })
})

const OPTIONAL_PROPERTY = /(?:^[ \t]*|[{;][ \t]*)(?:readonly[ \t]+)?(\w+)\?:/gm

const ALLOWED_OPTIONAL_PROPERTIES = {
  // 引数ごと `= {}` で省略できる中身で、既定値がある（例外5）
  "src/browser/components/page/achievement/components/bell/bell.tsx": ["size"],
  // Chart.js のデータセットの形の再掲（外来の型）
  "src/browser/components/page/conversation/components/markdown/renderer/chart-palette.ts": [
    "type",
    "data",
    "backgroundColor",
    "borderColor",
  ],
} satisfies Readonly<Record<string, readonly string[]>>

describe("オプショナルプロパティ", () => {
  it("src の *.ts / *.tsx（*.d.ts を除く）で、型のプロパティを `名前?: 型` と書くのは許可の一覧にある箇所だけ（docs/coding-standards.md「「無いかもしれない」値」）", () => {
    const allowed = new Set(allowedOptionalProperties())
    const offenders = optionalProperties().filter((found) => !allowed.has(found))

    expect(offenders.join("\n")).toBe("")
  })

  it("許可の一覧の項目が、実物にまだ `名前?: 型` として残っている", () => {
    const found = new Set(optionalProperties())
    const stale = allowedOptionalProperties().filter((entry) => !found.has(entry))

    expect(stale.join("\n")).toBe("")
  })
})

function allowedOptionalProperties(): readonly string[] {
  return Object.entries<readonly string[]>(ALLOWED_OPTIONAL_PROPERTIES).flatMap(([path, names]) =>
    names.map((name) => `${path}:${name}`),
  )
}

function optionalProperties(): readonly string[] {
  return lintedFiles(TYPESCRIPT_EXTENSIONS)
    .filter(({ path }) => path.startsWith("src/") && !path.endsWith(".d.ts"))
    .flatMap(({ path, lines }) => {
      const commentLines = new Set(commentLineIndexes(lines))
      const code = lines.map((line, index) => (commentLines.has(index) ? "" : line)).join("\n")
      return [...code.matchAll(OPTIONAL_PROPERTY)].map((match) => `${path}:${match[1]}`)
    })
}

function offendingCommentLines(
  extensions: readonly string[],
  isOffending: (line: string) => boolean,
): readonly string[] {
  return lintedFiles(extensions).flatMap(({ path, lines }) =>
    commentLineIndexes(lines)
      .filter((index) => isOffending(lines[index] ?? ""))
      .map((index) => `${path}:${index + 1}`),
  )
}

function lintedFiles(
  extensions: readonly string[],
): readonly { readonly path: string; readonly lines: readonly string[] }[] {
  return LINTED_DIRS.flatMap((dirName) => {
    const root = fileURLToPath(new URL(`../../${dirName}`, import.meta.url)).replace(/\/$/, "")
    return listSourceFiles(root, root, extensions).map((relPath) => ({
      path: `${dirName}/${relPath}`,
      lines: readFileSync(`${root}/${relPath}`, "utf8").split("\n"),
    }))
  })
}
