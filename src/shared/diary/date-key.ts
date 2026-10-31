// 日付ごとのファイルの名前や置き場になる日付キー（`YYYY-MM-DD`）の型と、その作り手。

import { z } from "zod"

/** 実在する日の `YYYY-MM-DD`。作れるのは {@link parseDateKey} と {@link dateKeySchema} だけ。 */
export type DateKey = string & { readonly __brand: "DateKey" }

export function parseDateKey(value: string): DateKey | undefined {
  return hasDateKeyShape(value) ? value : undefined
}

export const dateKeySchema = z.string().refine(hasDateKeyShape)

/** `YYYY-MM-DD` として読めれば {@link Temporal.PlainDate}、読めなければ `undefined`。 */
export function dateKeyOf(value: string): Temporal.PlainDate | undefined {
  try {
    return Temporal.PlainDate.from(value)
  } catch {
    return undefined
  }
}

/** 日付キーの日。作り手が実在の日だけを通すので、変換は投げない。 */
export function plainDateOfDateKey(date: DateKey): Temporal.PlainDate {
  return Temporal.PlainDate.from(date)
}

function hasDateKeyShape(value: string): value is DateKey {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && dateKeyOf(value)?.toString() === value
}
