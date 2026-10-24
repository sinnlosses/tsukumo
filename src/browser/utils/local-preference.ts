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
