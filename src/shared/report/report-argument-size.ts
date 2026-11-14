// `report` を呼んだ1回の引数の大きさ。字数（数）だけを持ち、引数の中身は持たない。

import { isPlainObject } from "remeda"

/** 欄ごとに数える最上位の欄。ここに無い名前の欄は全体にだけ数える。 */
export const REPORT_ARGUMENT_FIELDS = [
  "task",
  "workPlanClosing",
  "conclusion",
  "keyFigures",
  "figure",
  "sections",
  "body",
  "retrospective",
  "favor",
  "checks",
  "title",
  "sessionSummary",
  "sessionRemaining",
  "closing",
  "waitingLine",
] as const satisfies readonly string[]

export type ReportArgumentField = (typeof REPORT_ARGUMENT_FIELDS)[number]

/** 引数を JSON にしたときの字数。`fields` は渡された欄だけを持つ。 */
export type ReportArgumentChars = {
  readonly total: number
  readonly fields: Readonly<Partial<Record<ReportArgumentField, number>>>
}

export function reportArgumentCharsOf(input: unknown): ReportArgumentChars {
  if (!isPlainObject(input)) {
    return { total: 0, fields: {} }
  }
  return {
    total: jsonLength(input),
    fields: Object.fromEntries(
      REPORT_ARGUMENT_FIELDS.flatMap((field) =>
        input[field] === undefined ? [] : [[field, jsonLength(input[field])]],
      ),
    ),
  }
}

function jsonLength(value: unknown): number {
  return JSON.stringify(value)?.length ?? 0
}
