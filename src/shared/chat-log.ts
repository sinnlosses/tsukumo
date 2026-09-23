// 雑談モードの会話のログ（`docs/screen-design.md` 13.7）。**セッションの姿（`session-state.ts`）から
// 導くだけ**で、状態は持たない。
//
// **`main-view.ts` とは別に置く。** あちらは依頼を境目にやり取りへまとめ、タブで遡る形を作る
// （そのためにセリフの記録を落とす）。雑談のログは**素直な時系列**で、利用者の発言と
// キャラクターのセリフが交互に並ぶだけなので、並びの規則が違う。
//
// `node:` にも `document` にも触らない（他の shared と同じ制約）。

import { type Expression } from "./expression.ts"
import { byteLength } from "./lib/byte-length.ts"
import { type RecordedPromptImage } from "./prompt-image.ts"
import { type RecordTime, type SessionRecord } from "./session-state.ts"

/**
 * 会話のログ1件。**話したのがどちらか**と文面、話した時刻を持つ（`docs/screen-design.md` 13.7 の
 * 「利用者の発言とキャラクターのセリフが交互に並ぶ」「時刻と日の区切り」）。
 *
 * `expression` はキャラクターの側にだけ付く（話者の印に使う）。利用者の側は代わりに、
 * 添えた画像の**控え**（`images`。添えていなければ空）を持つ（`docs/requirements.md` 4.10。
 * 吹き出しの中に並ぶ）。
 */
export type ChatLogEntry =
  | {
      readonly speaker: "user"
      readonly text: string
      readonly images: readonly RecordedPromptImage[]
      readonly time: RecordTime
    }
  | {
      readonly speaker: "character"
      readonly text: string
      readonly expression: Expression
      readonly time: RecordTime
    }
  /**
   * 圧縮の区切り（`docs/glossary.md`「圧縮の区切り」）。**中身を持たない** — 出すのは細い線
   * 1本だけで、文言は添えない（`docs/chat-mode.md` 4.9「記憶の圧縮と忘却」）。
   */
  | { readonly speaker: "boundary" }

/**
 * 記録から雑談のログを組む（**古い→新しいの順**）。拾うのは利用者の依頼（`request`）と
 * セリフ（`speech`）、そして圧縮の区切り（`compact-boundary`）の3種類だけで、**本文
 * （`detail`）とツールは落とす**（雑談中はレポートを出さないと決めた。`docs/chat-mode.md` 4.9）。
 *
 * **落としたぶんを「省略した」と見せない。** 雑談中に本文が出るのは規約が守られなかった
 * ときだけで、画面にその事実を出しても利用者にできることが無い。
 */
export function chatLogEntries(records: readonly SessionRecord[]): readonly ChatLogEntry[] {
  return records.flatMap((record): readonly ChatLogEntry[] => {
    if (record.kind === "request") {
      return [{ speaker: "user", text: record.text, images: record.images, time: record.time }]
    }
    if (record.kind === "speech") {
      return [
        {
          speaker: "character",
          text: record.text,
          expression: record.expression,
          time: record.time,
        },
      ]
    }
    if (record.kind === "compact-boundary") {
      return [{ speaker: "boundary" }]
    }
    return []
  })
}

/**
 * ログに並べる1行。発言（{@link ChatLogEntry}）と、**日の区切り**（`docs/screen-design.md` 13.7
 * 「時刻と日の区切り」）の2種類。
 *
 * 発言の行が持つ `index` は {@link chatLogEntries} の並びでの位置（押して遡る行を指すのに使う。
 * 日の区切りが間に入っても番号はずれない）。日の区切りの `date` は、**その下に続く発言の日**。
 */
export type ChatLogRow =
  | { readonly kind: "entry"; readonly index: number; readonly entry: ChatLogEntry }
  | { readonly kind: "day"; readonly date: Temporal.PlainDate }

/**
 * ログの並びに日の区切りを差し込む（`docs/screen-design.md` 13.7「時刻と日の区切り」）。
 * **区切りが入るのは、日が変わった発言の手前だけ**で、並びの先頭には入れない。
 *
 * - 日を比べる相手は**1つ前の発言**。圧縮の区切り（`boundary`）は時刻を持たないので飛ばす
 * - **時刻の分からない発言**（`restored`。前のセッションを組み直したもの）は日を持たない。
 *   そこから時刻の分かる発言へ移るところは「日が変わった」として区切る —— 組み直したぶんと
 *   いまのぶんが同じ日に見えないように
 * - 時刻の分からない発言そのものの手前には入れない（起こし直すと記録は空から始まり、
 *   組み直したぶんは必ず先頭に固まっているので、時刻の分かる発言のあとに来ることは無い）
 *
 * `timeZone` は日の境目を決めるタイムゾーン（IANA の名前）。**ここでは読まない** —
 * 呼び出し側が OS の設定を読んで渡す（`shared` は外の世界に触らない）。
 */
export function chatLogRows(
  entries: readonly ChatLogEntry[],
  timeZone: string,
): readonly ChatLogRow[] {
  return entries.reduce<RowsInProgress>(
    (progress, entry, index) => {
      const row: ChatLogRow = { kind: "entry", index, entry }
      if (entry.speaker === "boundary") {
        return { rows: [...progress.rows, row], previous: progress.previous }
      }
      const day = entryDay(entry.time, timeZone)
      const divider: readonly ChatLogRow[] =
        day.kind === "date" && startsNewDay(progress.previous, day.date)
          ? [{ kind: "day", date: day.date }]
          : []
      return { rows: [...progress.rows, ...divider, row], previous: day }
    },
    { rows: [], previous: { kind: "none" } },
  ).rows
}

/**
 * 雑談の記憶を畳む閾値（バイト）。**逐語で読み戻す量（{@link CHAT_RECENT_READBACK_BYTES}）の
 * 2倍**で、絶対値はその倍率から出ている——揃えると畳んだ範囲を次のセッションが丸ごと逐語で
 * 戻すことになり、忘却が起きない。値の根拠は `docs/chat-mode.md` 4.9「記憶の圧縮と忘却」。
 */
export const CHAT_COMPACT_THRESHOLD_BYTES = 131_072 satisfies number

/**
 * 雑談を起こし直すときに、アーカイブから**逐語のまま**読み戻す量（バイト）。数えるのは各行の
 * 文面だけで、時刻・話者・表情は数えない。値の根拠は `docs/chat-mode.md` 4.9「直近の会話は
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
 * `docs/chat-mode.md` 4.9「残すと決めた1往復は窓から落とさない」。
 *
 * **窓とは別に持つ。** 窓の中で優先すると、旗の付いた件が増えるほど直近が押し出され、
 * 「いまの話が通じなくなる」ほうへ倒れる。外に足せば、読み戻し全体の上限は
 * **64 KiB + 8 KiB** で決まったままになる。
 */
export const CHAT_KEPT_READBACK_BYTES = 8_192 satisfies number

/**
 * `recall` で索引を引いたとき、**当たった日から一度に読み戻す量**（バイト）。数えるものは
 * 上の2つと同じ（各行の文面だけ）。値の根拠は `docs/chat-mode.md` 4.9「古い雑談は索引を
 * 引いて思い出す」。
 *
 * **窓（{@link CHAT_RECENT_READBACK_BYTES}）とも旗（{@link CHAT_KEPT_READBACK_BYTES}）とも
 * 別に持つ。** あの2つは起こすときの `systemPrompt` に1回載るもので、こちらは**ターンの途中で
 * モデルが引いたときに戻り値として入るもの**。**1ターンに1回だけ**引けるので、1ターンで増える
 * 文脈はこの値で頭打ちになる。
 */
export const CHAT_RECALL_READBACK_BYTES = 8_192 satisfies number

/**
 * 雑談のログの文面（利用者の依頼とキャラクターのセリフ）の UTF-8 バイト数を数える。
 * **添えた画像とツールの入出力は数えない**（`docs/chat-mode.md` 4.9「数え落としは許す」）——
 * `entries` は {@link chatLogEntries} の出力なので、本文・ツール・質問は最初から入っていない。
 * **圧縮の区切り（`boundary`）は文面を持たないので数えない。**
 */
export function chatLogByteSize(entries: readonly ChatLogEntry[]): number {
  return entries.reduce(
    (total, entry) => total + (entry.speaker === "boundary" ? 0 : byteLength(entry.text)),
    0,
  )
}

/**
 * 発言が属する日。**先頭（まだ発言が無い）・時刻の分からない発言・日付**の3つで、先頭では
 * 区切らず、時刻の分からない発言からは区切る（{@link chatLogRows}）。
 */
type EntryDay =
  | { readonly kind: "none" }
  | { readonly kind: "restored" }
  | { readonly kind: "date"; readonly date: Temporal.PlainDate }

/** {@link chatLogRows} の途中の姿（積んだ行と、1つ前の発言の日）。 */
type RowsInProgress = {
  readonly rows: readonly ChatLogRow[]
  readonly previous: EntryDay
}

function entryDay(time: RecordTime, timeZone: string): EntryDay {
  if (time.kind === "restored") {
    return { kind: "restored" }
  }
  return {
    kind: "date",
    date: Temporal.Instant.fromEpochMilliseconds(time.at)
      .toZonedDateTimeISO(timeZone)
      .toPlainDate(),
  }
}

/** 1つ前の発言の日から見て、`date` の発言の手前で区切るか。 */
function startsNewDay(previous: EntryDay, date: Temporal.PlainDate): boolean {
  switch (previous.kind) {
    case "none":
      return false
    case "restored":
      return true
    case "date":
      return !previous.date.equals(date)
  }
}
