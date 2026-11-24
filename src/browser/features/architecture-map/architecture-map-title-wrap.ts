// 図の箱の名前を、1行に収まる字数で2行に折り返す。
// 全角を1、半角を HALF_WIDTH と数える。

/** 半角の字の幅（全角を1とした割合）。 */
const HALF_WIDTH = 0.55

/**
 * 名前を、1行に `units` 字（全角を1、半角を 0.55 と数える）までで2行に折り返す。
 * 収まらないときだけ2行目の末尾を「…」で切る。半角の語は、行に入る範囲の空白か「-」の後ろで折る。
 */
export function wrappedTitle(text: string, units: number): readonly string[] {
  const chars = [...text]
  const first = lineStartSafe(chars, wordBreakOf(chars, fittingLength(chars, units)))
  const head = chars.slice(0, first).join("").trimEnd()
  const tail = chars.slice(first).join("")
  return tail === "" ? [head] : [head, fittedLine(tail, units)]
}

/** 1行に `units` 字までで切り、収まらないときは末尾を「…」にする。 */
export function fittedLine(text: string, units: number): string {
  const chars = [...text]
  const fit = fittingLength(chars, units)
  return fit >= chars.length ? text : `${chars.slice(0, fittingLength(chars, units - 1)).join("")}…`
}

function charWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0
  return code <= 0xff || (code >= 0xff61 && code <= 0xff9f) ? HALF_WIDTH : 1
}

/** 先頭から `units` に収まる字の数。1字も収まらなくても1字は返す。 */
function fittingLength(chars: readonly string[], units: number): number {
  let used = 0
  for (const [index, char] of chars.entries()) {
    used += charWidth(char)
    if (used > units) {
      return Math.max(1, index)
    }
  }
  return chars.length
}

/** 行頭に置けない字（長音・小書きの仮名・句読点・閉じ括弧）。 */
const NO_LINE_START =
  /[ーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ、。，．・：；！？）」』】〉》]/u

/** 2行目の頭が行頭に置けない字なら、その前で折る（1行目が空になるところまでは戻さない）。 */
function lineStartSafe(chars: readonly string[], fit: number): number {
  let index = fit
  while (index > 1 && index < chars.length && NO_LINE_START.test(chars[index] ?? "")) {
    index -= 1
  }
  return index
}

/** 半角の語の途中で切れるなら、収まる範囲の最後の空白か「-」の後ろまで戻す。 */
function wordBreakOf(chars: readonly string[], fit: number): number {
  if (fit >= chars.length || !isWordChar(chars[fit - 1]) || !isWordChar(chars[fit])) {
    return fit
  }
  for (let index = fit - 1; index > 0; index -= 1) {
    const char = chars[index - 1]
    if (char === " " || char === "-") {
      return index
    }
    if (!isWordChar(char)) {
      return fit
    }
  }
  return fit
}

function isWordChar(char?: string): boolean {
  return char !== undefined && /[A-Za-z0-9_]/.test(char)
}
