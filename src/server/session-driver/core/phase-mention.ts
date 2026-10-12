// 委譲先の段の範囲があるあいだ、セリフ・レポート・段のまとめが言う段の番号が範囲の外を指していないかの検査。
// 拾う形は「段n」「n段目」「n/N」で、「4段で」のような段の数の言い方と「三つ目の段」は拾わない。

import type { DelegatedRange } from "../../../shared/session/work-plan.ts"

export type PhaseMentionVerdict =
  | { readonly kind: "accepted" }
  | { readonly kind: "rejected"; readonly text: string }

/** 段の番号を範囲の外で言った呼び出しに返す直し方。 */
export const PHASE_MENTION_REJECTION_TEXT =
  "段の番号が委譲先の段の範囲の外を指している。受け入れ・計画は名前で言う。段の番号は委譲先の段と同じ。" +
  "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。"

/** `texts` のどれかが、範囲の1〜`count` の外の番号を言っていれば差し戻す。範囲が無ければ検査しない。 */
export function judgePhaseMention(
  range: DelegatedRange,
  texts: readonly string[],
): PhaseMentionVerdict {
  if (range.kind !== "range") {
    return ACCEPTED
  }
  const outside = texts.some((text) =>
    mentionedNumbers(text, range.count).some((number) => number < 1 || number > range.count),
  )
  return outside ? { kind: "rejected", text: PHASE_MENTION_REJECTION_TEXT } : ACCEPTED
}

/** 値の中の文字列をすべて集める（`report` の塊のように形が入れ子の引数から本文を拾う）。 */
export function stringsIn(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return [value]
  }
  if (Array.isArray(value)) {
    return value.flatMap(stringsIn)
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(stringsIn)
  }
  return []
}

const ACCEPTED = { kind: "accepted" } as const satisfies PhaseMentionVerdict

const ORDINAL_PATTERNS = [/段\s*(\d+)/gu, /(\d+)\s*段目/gu] as const

// 「n/N」は N が範囲の段の数と等しいときだけ段の番号と見る（日付・パス・件数の分数を拾わない）。
// 「計画 0/N」は返却の書式の引用なので拾わない。
const FRACTION_PATTERN = /(?<![\d/.-])(?<!計画\s*)(\d+)\s*\/\s*(\d+)(?![\d/])/gu

function mentionedNumbers(text: string, count: number): readonly number[] {
  const fractions = [...text.matchAll(FRACTION_PATTERN)]
    .filter((found) => Number(found[2]) === count)
    .map((found) => Number(found[1]))
  const ordinals = ORDINAL_PATTERNS.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((found) => Number(found[1])),
  )
  return [...ordinals, ...fractions]
}
