// 塊の種類と `report` の欄をまたいで共有する欄の形と、読み取り専用の型。

import { z } from "zod"

export const inlineText = z.string()

/**
 * 省いてよい欄。省いたら `fallback` として読む。
 * `.default()` と違い、transform を挟むので入力側の JSON Schema（`tools/list`）に既定値を出さない。
 */
export function omittable<S extends z.ZodType>(schema: S, fallback: z.output<S>) {
  return schema.optional().transform((value) => value ?? fallback)
}

/** 空でない文字列。`.min(1)` と違い、JSON Schema に `minLength` を出さない。 */
export function nonEmpty(schema: z.ZodString) {
  return schema.refine((text) => text.length > 0, {
    message: "Too small: expected string to have >=1 characters",
  })
}

/** 0 より大きい数。`.positive()` と違い、JSON Schema に `exclusiveMinimum` を出さない。 */
export const positiveNumber = z
  .number()
  .refine((value) => value > 0, { message: "Too small: expected number to be >0" })

// 畳むときの見出し。説明は `REPORT_SECTIONS_DESCRIPTION` に1回だけ書く
// （ここに `.describe` を足すと塊の数だけ繰り返されて JSON Schema が膨らむ）。
export const fold = omittable(z.string(), "")

// 塊の傍注（余白の柱に置く1行）。説明は `fold` と同じく `REPORT_SECTIONS_DESCRIPTION` に1回だけ書く。
export const aside = omittable(z.string(), "")

/**
 * 配列を読み取り専用の型に畳む。`z.array(...).readonly()` は JSON Schema に `readOnly: true` を
 * 出す（`tool` に渡す `report` の引数がこれで膨らむ）ので、型だけをここで付け直す。
 */
export type DeepReadonly<T> = T extends readonly (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T
