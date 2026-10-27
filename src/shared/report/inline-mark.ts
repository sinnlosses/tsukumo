// 文中に置く行内の印 `{{12 → 8}}`（前後の差）・`{{spark: 3 5 4 8}}`（折れ線）・`{{3 / 5}}`（帯）の読み方と、素の文字への畳み。
// 書式に当たらない `{{` は壊れた印で、畳みも描画もせず字のまま残す。inline code の中は読まない。

type InlineMark =
  | { readonly kind: "diff"; readonly from: string; readonly to: string }
  | { readonly kind: "spark"; readonly values: readonly number[] }
  | { readonly kind: "ratio"; readonly part: string; readonly whole: string }

type InlineSegment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "mark"; readonly source: string; readonly mark: InlineMark }
  | { readonly kind: "broken"; readonly text: string }

const CODE_SPAN = /(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g

/** 閉じた `{{…}}`（中に `{` `}` と改行を含まない）か、閉じていない `{{` だけ。 */
const BRACES = /\{\{[^{}\n]*\}\}|\{\{/g

const NUMBER = "-?\\d+(?:\\.\\d+)?"
const SPARK_BODY = /^spark:\s*(.*)$/
const RATIO_BODY = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/
const SPARK_NUMBER = new RegExp(`^${NUMBER}$`)
const DIFF_FORBIDDEN = /[`*_~[\]<>|\\]/

const MIN_SPARK_VALUES = 2
const MAX_SPARK_VALUES = 12

/**
 * 差の A・B それぞれの幅の上限（半角を 1、全角を 2 と数える）。
 * 印は折り返さないので、短い語か数に限って幅 360 の本文に両側と矢印が収まるようにする。
 */
const MAX_DIFF_SIDE_WIDTH = 16

const SPARK_LEVELS = "▁▂▃▄▅▆▇█"

/** 印を素の文字へ畳む（`12 → 8`・block 文字の列・`3/5`）。壊れた印と inline code の中はそのまま。 */
export function foldInlineMarks(text: string): string {
  return parseInlineMarks(text)
    .map((segment) => (segment.kind === "mark" ? foldedMark(segment.mark) : segment.text))
    .join("")
}

/** 印の部分を取り除いた文字。壊れた印と inline code の中は残る。 */
export function textOutsideInlineMarks(text: string): string {
  return parseInlineMarks(text)
    .map((segment) => (segment.kind === "mark" ? "" : segment.text))
    .join("")
}

/** 書式に当たらない `{{` の数（inline code の中は数えない）。 */
export function brokenInlineMarkCount(text: string): number {
  return parseInlineMarks(text).filter((segment) => segment.kind === "broken").length
}

/** 入力を欠けなく割る。各要素の文字を連ねると入力に戻る。inline code の範囲は `text` として通す。 */
export function parseInlineMarks(text: string): readonly InlineSegment[] {
  const codeSpans = [...text.matchAll(CODE_SPAN)]
  const bounds = codeSpans.reduce<{
    readonly parts: readonly InlineSegment[]
    readonly last: number
  }>(
    (acc, span) => ({
      parts: [
        ...acc.parts,
        ...proseSegments(text.slice(acc.last, span.index)),
        { kind: "text", text: span[0] },
      ],
      last: span.index + span[0].length,
    }),
    { parts: [], last: 0 },
  )
  return [...bounds.parts, ...proseSegments(text.slice(bounds.last))]
}

function foldedMark(mark: InlineMark): string {
  switch (mark.kind) {
    case "diff":
      return `${mark.from} → ${mark.to}`
    case "spark":
      return sparkBlocks(mark.values)
    case "ratio":
      return `${mark.part}/${mark.whole}`
  }
}

/** 最小〜最大を 8 段階の block 文字へ写す。全部同じ値なら中ほどの `▄` を並べる。 */
function sparkBlocks(values: readonly number[]): string {
  const min = Math.min(...values)
  const max = Math.max(...values)
  return values
    .map((value) =>
      max === min
        ? "▄"
        : (SPARK_LEVELS[Math.round(((value - min) / (max - min)) * (SPARK_LEVELS.length - 1))] ??
          "▄"),
    )
    .join("")
}

function proseSegments(prose: string): readonly InlineSegment[] {
  const found = [...prose.matchAll(BRACES)]
  const { parts, last } = found.reduce<{
    readonly parts: readonly InlineSegment[]
    readonly last: number
  }>(
    (acc, match) => ({
      parts: [
        ...acc.parts,
        { kind: "text", text: prose.slice(acc.last, match.index) },
        braceSegment(match[0]),
      ],
      last: match.index + match[0].length,
    }),
    { parts: [], last: 0 },
  )
  const all: readonly InlineSegment[] = [...parts, { kind: "text", text: prose.slice(last) }]
  return all.filter((segment) => segment.kind !== "text" || segment.text !== "")
}

function braceSegment(source: string): InlineSegment {
  const mark = source.length > 4 ? markOf(source.slice(2, -2).trim()) : undefined
  return mark === undefined ? { kind: "broken", text: source } : { kind: "mark", source, mark }
}

function markOf(body: string): InlineMark | undefined {
  const spark = SPARK_BODY.exec(body)
  if (spark !== null) {
    return sparkOf(spark[1] ?? "")
  }
  const ratio = RATIO_BODY.exec(body)
  if (ratio !== null) {
    return ratioOf(ratio[1] ?? "", ratio[2] ?? "")
  }
  return diffOf(body)
}

function sparkOf(list: string): InlineMark | undefined {
  const tokens = list.split(/[\s,]+/).filter((token) => token !== "")
  return tokens.length >= MIN_SPARK_VALUES &&
    tokens.length <= MAX_SPARK_VALUES &&
    tokens.every((token) => SPARK_NUMBER.test(token))
    ? { kind: "spark", values: tokens.map(Number) }
    : undefined
}

function ratioOf(part: string, whole: string): InlineMark | undefined {
  return Number(whole) > 0 && Number(part) <= Number(whole)
    ? { kind: "ratio", part, whole }
    : undefined
}

function diffOf(body: string): InlineMark | undefined {
  const sides = body.split("→").map((side) => side.trim())
  const [from, to] = sides
  return sides.length === 2 &&
    from !== undefined &&
    to !== undefined &&
    from !== "" &&
    to !== "" &&
    displayWidth(from) <= MAX_DIFF_SIDE_WIDTH &&
    displayWidth(to) <= MAX_DIFF_SIDE_WIDTH &&
    !DIFF_FORBIDDEN.test(body)
    ? { kind: "diff", from, to }
    : undefined
}

function displayWidth(text: string): number {
  return [...text].reduce((total, char) => total + ((char.codePointAt(0) ?? 0) > 0x7f ? 2 : 1), 0)
}
