import { describe, expect, it } from "vitest"

import { commentLineIndexes, withoutComments } from "./comment-line.ts"
import { lintedFiles } from "./linted-file.ts"

// コメントから別の場所を、名前・置き場所が変わると古くなるもので指していないかを見る
// （docs/coding-standards.md「コメント」の「別の場所を指すとき」）。
// 見るのは `oxlint` と同じ `src` `test` `scripts` の3つで、コメントの行だけ。
//
// 規則は3つ。
// - ソースファイル名（拡張子が .ts / .tsx）を書かない。コードはシンボルの名前で指す
// - 正典の節を番号つきで指さない（節の検査は句しか照らさないので、番号は黙って古くなる）
// - 行コメントの中に link のタグを書かない（エディタが解決するのは JSDoc の中だけ）

// 置き場所そのものを検査するテストの置き場で、コメントに出るパスは指し先ではなく検査の中身。
const SOURCE_FILE_NAME_EXEMPT = "test/architecture/"

// ディレクトリつき・相対パスつきのファイル名も1つとして拾う。
const SOURCE_FILE_NAME = /[\w./@-]*[\w-]\.tsx?(?![\w.])/g

// 指し先ではないもの。
// 型定義（外部パッケージのもの）、先頭が `.` の接尾辞（`.test.ts` のような形の話）、
// 扱うデータの形を示す例のパス（名前を foo / bar / baz にする約束）。
const NOT_A_POINTER = /\.d\.ts$|^\.[a-z]|(?:^|\/)(?:foo|bar|baz)\.tsx?$/

// コマンドとして打つ形（`node` や `pnpm run` のあとのスクリプト）は、指し先ではなく打つ文字列。
const COMMAND_PREFIX = /\b(?:node|pnpm(?: run)?) $/

const NUMBERED_SECTION_REFERENCE =
  /(?<![\w/.-])(?:docs\/[a-z0-9-]+(?:\/[a-z0-9-]+)*|CLAUDE|README)\.md`?[ \t]*(?:\d+(?:\.\d+)*章?|原則\d+)(?![\w.])/

const LINK_IN_LINE_COMMENT = /^\s*\/\/.*\{@link\b/

describe("コメント中の指し方", () => {
  it("コメントでファイル名・節番号・行コメントの {@link} を使わない", () => {
    const offenders = lintedFiles(COMMENTED_EXTENSIONS).flatMap(violationsOf)

    expect(offenders.join("\n")).toBe("")
  })
})

// コメントに特定の日付を書かない（`docs/coding-standards.md`「コメント」の表。「いつ決まったか・
// 誰が言ったか（特定の日付・「〜の指摘」「ユーザーの決定」）」は禁止で、理由（Why / Why not）は
// 残す。日付つきの記録は `docs/architecture.md` と `docs/history/` が持つ）。`oxlint` と同じ
// `src` `test` `scripts` を見る（`package.json` の `lint`。`docs/` `.tw/` は対象外——
// ドキュメントは日付つきの記録を持つのが正しい）。
//
// コメント行は `commentLineIndexes` で拾う（`.css` の `/* */` も含む）。行の途中で開くブロック
// コメントと、行の途中にある `//` は拾わない。`test/` のフィクスチャに出てくる `date` フィールドの
// ようなテストデータの日付は、コメント行でないのでこれで自然に除外される。
// 見本のパス（`docs/history/mockup/…`）はディレクトリ名に日付を持つので、パスだけを除いて見る。
const COMMENTED_EXTENSIONS = [".ts", ".tsx", ".css"] as const satisfies readonly string[]
const TYPESCRIPT_EXTENSIONS = [".ts", ".tsx"] as const satisfies readonly string[]
const MOCKUP_PATH = /docs\/history\/mockup\/[\w./-]*/g
const SPECIFIC_DATE = /\d{4}-\d{2}-\d{2}/

describe("コメント中の日付", () => {
  it("src / test / scripts の *.ts / *.tsx / *.css で、コメント行が見本のパスの外に特定の日付（YYYY-MM-DD）を含まない", () => {
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
  it("src / test / scripts の *.ts / *.tsx で、コメント行が強調（`**…**`）を含まない", () => {
    const offenders = offendingCommentLines(TYPESCRIPT_EXTENSIONS, (line) =>
      COMMENT_EMPHASIS.test(line),
    )

    const hint =
      "コメントに Markdown の強調を使わない（docs/coding-standards/comment-reference-and-style.md「コメント」の「書き方は3つ守る」）"
    expect(offenders.length === 0 ? "" : [hint, ...offenders].join("\n")).toBe("")
  })
})

const CALLER_LIST_IN_PARENS =
  /（`[^`]+`(?:\s*[・、と/]\s*`[^`]+`)*\s*(?:(?:が|から)(?:呼ぶ|使う|呼び出す)|に(?:呼ばれる|使われる))）/

describe("コメント中の呼ぶ側", () => {
  it("src / test / scripts の *.ts / *.tsx で、コメント行が括弧に呼ぶ側・使う側を並べない（docs/coding-standards/comment-reference-and-style.md「別の場所を指すとき」）", () => {
    const offenders = offendingCommentLines(TYPESCRIPT_EXTENSIONS, (line) =>
      CALLER_LIST_IN_PARENS.test(line),
    )

    expect(offenders.join("\n")).toBe("")
  })
})

const JSDOC_OPENING_WITH_TEXT = /^\s*\/\*\* \S/

describe("複数行の JSDoc の書き出し", () => {
  it("src / test / scripts の *.ts / *.tsx で、複数行の JSDoc が `/**` だけの行で書き出される（docs/coding-standards.md「コメント」）", () => {
    const offenders = offendingCommentLines(
      TYPESCRIPT_EXTENSIONS,
      (line) => JSDOC_OPENING_WITH_TEXT.test(line) && !line.includes("*/"),
    )

    expect(offenders.join("\n")).toBe("")
  })
})

// JSDoc のリンクの指す先が、そのファイルで宣言も import もされていないものを落とす検査。
describe("{@link} の指す先", () => {
  it("`{@link 名前}` の名前の頭の識別子は、同じファイルの本文に現れる", () => {
    const offenders = lintedFiles(TYPESCRIPT_EXTENSIONS).flatMap(({ path, lines }) =>
      unresolvedLinkNames(lines.join("\n")).map((name) => `${path}: ${name}`),
    )

    expect(offenders).toEqual([])
  })

  it("本文に現れない名前を拾い、頭の識別子だけを見て、import() の形は見ない", () => {
    expect(unresolvedLinkNames("/** {@link Missing} */\nconst a = 1")).toEqual(["Missing"])
    expect(unresolvedLinkNames("/** {@link Foo.bar} */\nconst Foo = 1")).toEqual([])
    expect(unresolvedLinkNames("/** {@link Foo.bar} */\nconst a = 1")).toEqual(["Foo"])
    expect(unresolvedLinkNames('/** {@link import("./a.ts").B} */\nconst a = 1')).toEqual([])
    expect(unresolvedLinkNames("/** {@link Only} */\n// Only\nconst a = 1")).toEqual(["Only"])
    expect(unresolvedLinkNames("/** {@link expanded} */\nconst expanded = true")).toEqual([])
  })
})

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

function unresolvedLinkNames(content: string): readonly string[] {
  const body = withoutComments(content)
  const heads = [...content.matchAll(/\{@link\s+([^}\s|]+)/g)]
    .flatMap(([, name]) => (name === undefined || name.startsWith("import(") ? [] : name))
    .map((name) => name.split(".")[0] ?? name)
  return [...new Set(heads)].filter((head) => !appearsAsWord(body, head))
}

function appearsAsWord(body: string, word: string): boolean {
  return new RegExp(`(?<![\\w$])${word.replaceAll("$", "\\$")}(?![\\w$])`).test(body)
}

/** ファイル1つの違反を `パス:行: 中身` の形で返す。 */
function violationsOf({
  path,
  lines,
}: {
  readonly path: string
  readonly lines: readonly string[]
}): readonly string[] {
  const checksFileName = !path.startsWith(SOURCE_FILE_NAME_EXEMPT)
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
