// 塊の種類をまたいで共有する欄と、読み取り専用の型。

import { z } from "zod"

export const inlineText = z.string()

// 畳むときの見出し。説明は `REPORT_SECTIONS_DESCRIPTION` に1回だけ書く
// （ここに `.describe` を足すと塊の数だけ繰り返されて JSON Schema が膨らむ）。
export const fold = z.string().default("")

// 塊の傍注（余白の柱に置く1行）。説明は `fold` と同じく `REPORT_SECTIONS_DESCRIPTION` に1回だけ書く。
export const aside = z.string().default("")

/**
 * 配列を読み取り専用の型に畳む。`z.array(...).readonly()` は JSON Schema に `readOnly: true` を
 * 出す（`tool` に渡す `report` の引数がこれで膨らむ）ので、型だけをここで付け直す。
 */
export type DeepReadonly<T> = T extends readonly (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T
