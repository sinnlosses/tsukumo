// 利用者の端末ごとの好みを `localStorage` に持つ口。ブラウザで `localStorage` に触るのはこのファイルだけ。
// 読めない・壊れた・schema に通らない値は `fallback` に畳み、書けないとき（容量・プライベートウィンドウ）は握りつぶして続ける。
// 保存形式は `codec` で決める。既定は JSON。生文字列や数値の文字列で保存済みの鍵は、その形のまま読み書きするために codec を渡す。

import type { z } from "zod"

export type LocalPreferenceCodec<Value> = {
  /** 保存された文字列を、schema に渡す前の値にする。読めなければ throw してよい（`fallback` に畳まれる）。 */
  readonly parse: (raw: string) => unknown
  readonly serialize: (value: Value) => string
}

const JSON_CODEC: LocalPreferenceCodec<unknown> = {
  parse: (raw) => {
    const parsed: unknown = JSON.parse(raw)
    return parsed
  },
  serialize: (value) => JSON.stringify(value),
}

/** 文字列をそのまま保存する鍵用。 */
export const RAW_STRING_CODEC: LocalPreferenceCodec<string> = {
  parse: (raw) => raw,
  serialize: (value) => value,
}

export type LocalPreference<Value> = {
  readonly load: () => Value
  readonly save: (value: Value) => void
}

export function localPreference<Value>(
  key: string,
  schema: z.ZodType<Value>,
  fallback: Value,
  codec: LocalPreferenceCodec<Value> = JSON_CODEC,
): LocalPreference<Value> {
  return {
    load: () => {
      try {
        const raw = localStorage.getItem(key)
        if (raw === null) {
          return fallback
        }
        const parsed = schema.safeParse(codec.parse(raw))
        return parsed.success ? parsed.data : fallback
      } catch {
        // 保存先が使えない・壊れた値は既定値に倒す
        return fallback
      }
    },
    save: (value) => {
      try {
        localStorage.setItem(key, codec.serialize(value))
      } catch {
        // 書けないだけなので、保存できないまま続ける。
      }
    },
  }
}

/** 持ち先を移した鍵を1回読むときの結果。鍵が無い・読める値がある・壊れている、を分ける。 */
export type LegacyPreferenceRead<Value> =
  | { readonly kind: "absent" }
  | { readonly kind: "value"; readonly value: Value }
  | { readonly kind: "broken" }

export type LegacyPreference<Value> = {
  readonly read: () => LegacyPreferenceRead<Value>
  /** 鍵を消す。消せないとき（保存先が使えない）は握りつぶし、次に開いたときにまた読まれる。 */
  readonly remove: () => void
}

/** 持ち先を移した鍵を、移す処理が1回だけ読んで消すための口。 */
export function legacyPreference<Value>(
  key: string,
  schema: z.ZodType<Value>,
  codec: Pick<LocalPreferenceCodec<unknown>, "parse"> = JSON_CODEC,
): LegacyPreference<Value> {
  return {
    read: () => {
      try {
        const raw = localStorage.getItem(key)
        if (raw === null) {
          return { kind: "absent" }
        }
        const parsed = schema.safeParse(codec.parse(raw))
        return parsed.success ? { kind: "value", value: parsed.data } : { kind: "broken" }
      } catch {
        // 保存先が使えないときも、鍵が無いのと同じく移すものは無い
        return { kind: "absent" }
      }
    },
    remove: () => {
      try {
        localStorage.removeItem(key)
      } catch {
        // 消せなくても、`state.json` に値が入れば次に開いたときに古い鍵として消える。
      }
    },
  }
}
