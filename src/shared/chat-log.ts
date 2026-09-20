// 雑談モードの会話のログ（`docs/design.md` 13.7）。**セッションの姿（`session-state.ts`）から
// 導くだけ**で、状態は持たない。
//
// **`main-view.ts` とは別に置く。** あちらは依頼を境目にやり取りへまとめ、タブで遡る形を作る
// （そのためにセリフの記録を落とす）。雑談のログは**素直な時系列**で、利用者の発言と
// キャラクターのセリフが交互に並ぶだけなので、並びの規則が違う。
//
// `node:` にも `document` にも触らない（他の shared と同じ制約）。

import { type Expression } from "./expression.ts"
import { type SessionRecord } from "./session-state.ts"

/**
 * 会話のログ1件。**話したのがどちらか**と文面だけを持つ（`docs/design.md` 13.7 の
 * 「利用者の発言とキャラクターのセリフが交互に並ぶ」）。
 *
 * `expression` はキャラクターの側にだけ付く（話者の印に使う）。利用者の側は代わりに、
 * 添えた画像の**控え**（`images`。添えていなければ空）を持つ（`docs/requirements.md` 4.10。
 * 吹き出しの中に並ぶ）。
 */
export type ChatLogEntry =
  | { readonly speaker: "user"; readonly text: string; readonly images: readonly string[] }
  | { readonly speaker: "character"; readonly text: string; readonly expression: Expression }

/**
 * 記録から雑談のログを組む（**古い→新しいの順**）。拾うのは利用者の依頼（`request`）と
 * セリフ（`speech`）の2種類だけで、**本文（`detail`）とツールは落とす**
 * （雑談中はレポートを出さないと決めた。`docs/requirements.md` 4.9）。
 *
 * **落としたぶんを「省略した」と見せない。** 雑談中に本文が出るのは規約が守られなかった
 * ときだけで、画面にその事実を出しても利用者にできることが無い。
 */
export function chatLogEntries(records: readonly SessionRecord[]): readonly ChatLogEntry[] {
  return records.flatMap((record): readonly ChatLogEntry[] => {
    if (record.kind === "request") {
      return [{ speaker: "user", text: record.text, images: record.images }]
    }
    if (record.kind === "speech") {
      return [{ speaker: "character", text: record.text, expression: record.expression }]
    }
    return []
  })
}

/**
 * 雑談の記憶を畳む閾値（バイト）。値の根拠は `docs/requirements.md` 4.9「記憶の圧縮と忘却」。
 */
export const CHAT_COMPACT_THRESHOLD_BYTES = 32_768 satisfies number

const textEncoder = new TextEncoder()

/**
 * 雑談のログの文面（利用者の依頼とキャラクターのセリフ）の UTF-8 バイト数を数える。
 * **添えた画像とツールの入出力は数えない**（`docs/requirements.md` 4.9「数え落としは許す」）——
 * `entries` は {@link chatLogEntries} の出力なので、本文・ツール・質問は最初から入っていない。
 */
export function chatLogByteSize(entries: readonly ChatLogEntry[]): number {
  return entries.reduce((total, entry) => total + textEncoder.encode(entry.text).length, 0)
}
