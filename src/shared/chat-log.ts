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
   * 圧縮の区切り（`docs/glossary.md`「圧縮の区切り」）。**中身を持たない** — 出すのは細い線
   * 1本だけで、文言は添えない（`docs/requirements.md` 4.9「記憶の圧縮と忘却」）。
   */
  | { readonly speaker: "boundary" }

/**
 * 記録から雑談のログを組む（**古い→新しいの順**）。拾うのは利用者の依頼（`request`）と
 * セリフ（`speech`）、そして圧縮の区切り（`compact-boundary`）の3種類だけで、**本文
 * （`detail`）とツールは落とす**（雑談中はレポートを出さないと決めた。`docs/requirements.md` 4.9）。
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
    if (record.kind === "compact-boundary") {
      return [{ speaker: "boundary" }]
    }
    return []
  })
}

/**
 * 雑談の記憶を畳む閾値（バイト）。**逐語で読み戻す量（{@link CHAT_RECENT_READBACK_BYTES}）の
 * 2倍**で、絶対値はその倍率から出ている——揃えると畳んだ範囲を次のセッションが丸ごと逐語で
 * 戻すことになり、忘却が起きない。値の根拠は `docs/requirements.md` 4.9「記憶の圧縮と忘却」。
 */
export const CHAT_COMPACT_THRESHOLD_BYTES = 131_072 satisfies number

/**
 * 雑談を起こし直すときに、アーカイブから**逐語のまま**読み戻す量（バイト）。数えるのは各行の
 * 文面だけで、時刻・話者・表情は数えない。値の根拠は `docs/requirements.md` 4.9「直近の会話は
 * 逐語のまま読み戻す」。
 *
 * **畳む閾値（{@link CHAT_COMPACT_THRESHOLD_BYTES}）とは別の値で、閾値のほうが大きい。**
 * 前者は「いつ畳むか」、こちらは「新しいセッションへ逐語で何を渡すか」。**こちらが「覚えている
 * 距離」そのもの**で、閾値はその2倍に置く（隣に置いてあるのは、同じ物差し＝文面のバイト数で
 * 測るものだから）。
 */
export const CHAT_RECENT_READBACK_BYTES = 65_536 satisfies number

/**
 * 「残す」旗の付いたやり取りを、上の窓（{@link CHAT_RECENT_READBACK_BYTES}）の**外側に足して**
 * 読み戻す量（バイト）。数えるものは同じ（各行の文面だけ）。値の根拠は
 * `docs/requirements.md` 4.9「残すと決めた1往復は窓から落とさない」。
 *
 * **窓とは別に持つ。** 窓の中で優先すると、旗の付いた件が増えるほど直近が押し出され、
 * 「いまの話が通じなくなる」ほうへ倒れる。外に足せば、読み戻し全体の上限は
 * **64 KiB + 8 KiB** で決まったままになる。
 */
export const CHAT_KEPT_READBACK_BYTES = 8_192 satisfies number

/**
 * `recall` で索引を引いたとき、**当たった日から一度に読み戻す量**（バイト）。数えるものは
 * 上の2つと同じ（各行の文面だけ）。値の根拠は `docs/requirements.md` 4.9「古い雑談は索引を
 * 引いて思い出す」。
 *
 * **窓（{@link CHAT_RECENT_READBACK_BYTES}）とも旗（{@link CHAT_KEPT_READBACK_BYTES}）とも
 * 別に持つ。** あの2つは起こすときの `systemPrompt` に1回載るもので、こちらは**ターンの途中で
 * モデルが引いたときに戻り値として入るもの**。**1ターンに1回だけ**引けるので、1ターンで増える
 * 文脈はこの値で頭打ちになる。
 */
export const CHAT_RECALL_READBACK_BYTES = 8_192 satisfies number

const textEncoder = new TextEncoder()

/**
 * 雑談のログの文面（利用者の依頼とキャラクターのセリフ）の UTF-8 バイト数を数える。
 * **添えた画像とツールの入出力は数えない**（`docs/requirements.md` 4.9「数え落としは許す」）——
 * `entries` は {@link chatLogEntries} の出力なので、本文・ツール・質問は最初から入っていない。
 * **圧縮の区切り（`boundary`）は文面を持たないので数えない。**
 */
export function chatLogByteSize(entries: readonly ChatLogEntry[]): number {
  return entries.reduce(
    (total, entry) =>
      total + (entry.speaker === "boundary" ? 0 : textEncoder.encode(entry.text).length),
    0,
  )
}
