// 書きかけの本文を、空行を境にした塊へ割る（`docs/design.md` 6.3）。呼び出し側
// （`src/browser/components/page/conversation/components/main-view/components/report/report.tsx`）が塊ごとに `Markdown` を独立して描き、変わらない塊は
// `React.memo` で描き直さない。ここは純粋関数だけを置く（React を import しない）。
//
// 塊をまたぐ Markdown の参照は成立しない。 脚注（`[^1]`）は参照と定義が別の塊に落ちると
// 記号のまま出るので、空行を挟まず同じ塊に書いたときだけ成立する（目視で確認済み）。
// `src/server/report/core/report-notation.ts` の規約が脚注を名乗っていないのはこのため。

/**
 * 通してよい HTML（`sanitize-schema.ts`）のうち、閉じタグが必須で中身を囲む要素。ここに
 * 載っている要素の中では空行で割らない（`<details>` の中で表や箇条書きを使うには、CommonMark の
 * 規則で空行が要るため）。
 *
 * 閉じタグを省ける要素（`p` / `li` / `dt` / `dd` / `tr` / `td` / `th` / `thead` / `tbody`）は
 * 入れない。省略された閉じタグを待ち続けると、以降ずっと割れなくなる。
 */
const HTML_BLOCK_TAG_NAMES: ReadonlySet<string> = new Set([
  "div",
  "details",
  "summary",
  "section",
  "article",
  "aside",
  "figure",
  "figcaption",
  "blockquote",
  "table",
  "dl",
  "ul",
  "ol",
  "pre",
  "svg",
  "g",
  "defs",
  "marker",
])

/** 行の中のタグ。属性値に `>` を含む書き方（`title="a > b"`）は数えられない。 */
const HTML_TAG_PATTERN = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^<>]*?)?(\/?)>/g

/** 行頭（インデント3つまで）で始まる開きタグ。CommonMark が HTML ブロックと見なす形に合わせる。 */
const HTML_BLOCK_START_PATTERN = /^ {0,3}<([a-zA-Z][a-zA-Z0-9-]*)/

/** コードスパン（`` `…` ``）。中に書かれたタグは文字であって要素ではない。 */
const CODE_SPAN_PATTERN = /`[^`]*`/g

/** フェンス付きコードブロックの区切り行（`` ``` `` / `~~~`、行頭インデント3つまで）。 */
const FENCE_DELIMITER_PATTERN = /^ {0,3}(`{3,}|~{3,})/

/**
 * フェンス付きコードブロックと HTML ブロックの中の空行では割らない。 閉じていないもの
 * （発話が途中で切れた等）は最後の塊の中に閉じるので、続きの行が表や見出しに化けたり、
 * `<details>` の中身が外へこぼれたりしない（テスト観点9）。
 */
export function splitReportBlocks(markdown: string): readonly string[] {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n")
  const blocks: string[] = []
  let current: string[] = []
  let inFence = false
  let htmlDepth = 0

  for (const line of lines) {
    if (isFenceDelimiterLine(line)) {
      inFence = !inFence
    } else if (!inFence && (htmlDepth > 0 || startsHtmlBlock(line))) {
      htmlDepth = Math.max(0, htmlDepth + htmlBlockDepthDelta(line))
    }

    if (line.trim() === "" && !inFence && htmlDepth === 0) {
      if (current.length > 0) {
        blocks.push(current.join("\n"))
        current = []
      }
      continue
    }
    current.push(line)
  }
  if (current.length > 0) {
    blocks.push(current.join("\n"))
  }

  return blocks
}

function isFenceDelimiterLine(line: string): boolean {
  return FENCE_DELIMITER_PATTERN.test(line)
}

function startsHtmlBlock(line: string): boolean {
  const name = HTML_BLOCK_START_PATTERN.exec(line)?.[1]

  return name !== undefined && HTML_BLOCK_TAG_NAMES.has(name.toLowerCase())
}

/** 1行の中で開いた数から閉じた数を引く。自己閉じタグ（`<rect />`）は開きに数えない。 */
function htmlBlockDepthDelta(line: string): number {
  return [...line.replaceAll(CODE_SPAN_PATTERN, "").matchAll(HTML_TAG_PATTERN)]
    .filter((tag) => HTML_BLOCK_TAG_NAMES.has((tag[2] ?? "").toLowerCase()))
    .reduce((depth, tag) => {
      if (tag[1] === "/") {
        return depth - 1
      }

      return tag[3] === "/" ? depth : depth + 1
    }, 0)
}
