// 塊の文字を Markdown か HTML の中へ埋めるときの逃がし方。
//
// Markdown に埋める文字は行頭の塊の記法と `<` を逃がして改行を畳み、許すのはインラインの記法（inline code・太字・リンク）だけにする。
// HTML に埋める文字は HTML として逃がし、Markdown の記法は効かせない。ただし `htmlInlineWithCode` は inline code だけ `code` 要素にする。

import { foldInlineMarks } from "./inline-mark.ts"

/** inline code（開きと同じ数のバッククォートで閉じる）。中の文字は逃がさない。 */
const CODE_SPAN = /(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g

/** 番号付きリストの頭（`1.` / `1)`）。1つ目が番号、2つ目が区切りの記号。 */
const ORDERED_LIST_START = /^(\d{1,9})([.)])(?=\s|$)/

export function joinParts(parts: readonly string[]): string {
  return parts.filter((part) => part.trim() !== "").join("\n\n")
}

/**
 * HTML の中に埋める1行の文字。改行を空白に畳み、HTML として逃がす（Markdown の記法は効かない）。
 */
export function htmlInline(text: string): string {
  return escapeHtml(plainInline(text))
}

/** 逃がす前の1行の字。改行を空白に畳み、行内の印は素の字にする（React が要素の中身や属性に直接渡す）。 */
export function plainInline(text: string): string {
  return foldInlineMarks(text).replace(/\s+/g, " ").trim()
}

/** 二重引用符で囲む HTML 属性の値に埋める1行の文字。`htmlInline` に加えて `"` も逃がす。 */
export function htmlAttribute(text: string): string {
  return htmlInline(text).replaceAll('"', "&quot;")
}

/**
 * フェンスで囲む。フェンスは中身に出てくるバッククォートの並びより長くする（中身で閉じないように）。
 */
export function fencedMarkdown(info: string, source: string): string {
  const longest = Math.max(0, ...[...source.matchAll(/`+/g)].map(([run]) => run.length))
  const fence = "`".repeat(Math.max(3, longest + 1))
  return `${fence}${info}\n${source.replace(/\n$/, "")}\n${fence}`
}

/** 改行（と前後の空白）を空白1つに畳み、両端を落とした1行の文字。 */
export function flatInline(text: string): string {
  return text.replace(/\s*\n\s*/g, " ").trim()
}

/**
 * Markdown の中に埋める1行の文字。改行を空白に畳み、inline code の外の `<` を逃がし、
 * 行頭で塊の記法（見出し・引用・箇条書き・番号付きリスト・表・フェンス・区切り線）になる文字を逃がす。
 */
export function markdownInline(text: string): string {
  return escapeLineStart(
    mapCodeSpans(
      flatInline(text),
      (part) => part.replaceAll("<", "&lt;"),
      (span) => span,
    ),
  )
}

/**
 * HTML の中に埋める1行の文字。`htmlInline` と同じく逃がし、inline code だけは `code` 要素にする
 * （HTML の中では Markdown の inline code が効かないため）。
 */
export function htmlInlineWithCode(text: string): string {
  return htmlInlineSegments(text)
    .map((segment) =>
      segment.kind === "code"
        ? `<code>${escapeHtml(segment.value)}</code>`
        : escapeHtml(segment.value),
    )
    .join("")
}

/** 1行の字を、inline code の外（`text`）と中（`code`）に分けたもの。逃がす前の字で、空の字は含まない。 */
export type HtmlInlineSegment = {
  readonly kind: "text" | "code"
  readonly value: string
}

/** {@link htmlInlineWithCode} と同じ畳み方で、字を `code` とそれ以外に分ける（HTML の文字にはしない）。 */
export function htmlInlineSegments(text: string): readonly HtmlInlineSegment[] {
  const flat = foldInlineMarks(text).replace(/\s+/g, " ").trim()
  const { segments, last } = [...flat.matchAll(CODE_SPAN)].reduce<{
    readonly segments: readonly HtmlInlineSegment[]
    readonly last: number
  }>(
    (acc, match) => ({
      segments: [
        ...acc.segments,
        { kind: "text", value: flat.slice(acc.last, match.index) },
        { kind: "code", value: codeSpanContent(match[0]) },
      ],
      last: match.index + match[0].length,
    }),
    { segments: [], last: 0 },
  )
  return [...segments, { kind: "text" as const, value: flat.slice(last) }].filter(
    (segment) => segment.kind === "code" || segment.value !== "",
  )
}

export function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

/** inline code の中身。CommonMark に合わせ、両端に空白があれば1つずつ落とす。 */
function codeSpanContent(span: string): string {
  const fence = /^`+/.exec(span)?.[0].length ?? 0
  const inner = span.slice(fence, span.length - fence)
  return /^ .*[^ ].* $/.test(inner) ? inner.slice(1, -1) : inner
}

function escapeLineStart(text: string): string {
  if (/^([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(text)) {
    return `\\${text}`
  }
  if (ORDERED_LIST_START.test(text)) {
    return text.replace(ORDERED_LIST_START, "$1\\$2")
  }
  // info 文字列にバッククォートがある行はフェンスにならない（CommonMark）。```x``` は inline code
  return /^(?:#|>|\||[-+*](?=\s|$)|`{3,}[^`]*$|~{3,})/.test(text) ? `\\${text}` : text
}

function mapCodeSpans(
  text: string,
  outside: (part: string) => string,
  span: (codeSpan: string) => string,
): string {
  const { parts, last } = [...text.matchAll(CODE_SPAN)].reduce<{
    readonly parts: readonly string[]
    readonly last: number
  }>(
    (acc, match) => ({
      parts: [...acc.parts, outside(text.slice(acc.last, match.index)), span(match[0])],
      last: match.index + match[0].length,
    }),
    { parts: [], last: 0 },
  )
  return [...parts, outside(text.slice(last))].join("")
}
