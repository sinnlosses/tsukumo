// tsukumo が雑談モードの記憶を畳むときに送る `/compact` の文面と、その結果（要約の写し）から
// 最近の話題の見出しを読み出す口（`docs/chat-mode.md` 4.9「記憶の圧縮と忘却」）。
// `chat-manner.ts` の隣に置く（モデルに見せる文面は core 側）。
//
// **依頼の文面と読み出しを同じファイルに置く**のは、見出しを挟む印（`<topics>`）の形を両側で
// 1つに保つため。文面だけ変えて読み出しが黙って空になる、を起こさない。
//
// 閾値を超えたかどうかの判断（{@link ChatCompactWatch}）もここが持つ。**いつ見るか**
// （ターンの終わりに1回）を決めるのは `src/server/core/session-manager.ts` で、
// 写しのファイルに触るのは `src/server/chat/adapter/chat-summary.ts`。ここは「決める」内容だけで、
// 外の世界には触らない（原則2）。

import { chatLogByteSize } from "../../../shared/chat-log.ts"
import { type SessionEvent } from "../../../shared/session-event.ts"
import { type ChatSummary, type SessionDriver } from "../../session-driver/core/session-driver.ts"

/** サイドバーの「最近の話題」に出す見出しの件数の上限（`docs/screen-design.md` 13.7）。 */
export const CHAT_TOPIC_LIMIT = 3

/** 話題の見出しを挟む印。要約の中で1行を占める前提で、行の中の位置は問わない。 */
const CHAT_TOPICS_OPEN = "<topics>"
const CHAT_TOPICS_CLOSE = "</topics>"

/** 見出しの行の頭に付いた箇条の印（`- ` `* ` `・` `1. `）。 */
const LIST_MARKER = /^(?:[-*・•]|\d+[.)])\s*/u

/**
 * 要約の指示。引く線は「プロフィールの書き戻し」の3条件と同じ（`docs/chat-mode.md` 4.9）:
 * 自分の言葉で書き直す・発言を引用しない・利用者について知ったことは書かない。
 *
 * **話題の見出しは要約のいちばん最後に置かせる。** 写しが 8 KiB を超えたときは古いほう
 * （先頭側）の行から落ちる（`src/server/chat/adapter/chat-summary.ts`）ので、末尾に置けば見出しの
 * 節が先に落ちない。印を XML の組にするのは、`/compact` がもともと `<analysis>` と
 * `<summary>` の組で書かせる形なので、モデルがそのまま書ける形だから。
 */
const CHAT_COMPACT_INSTRUCTION =
  "覚えておくことだけを短く、自分の言葉で書き直してください。発言をそのまま引用せず、" +
  "利用者について知ったことは書かないでください。" +
  `要約のいちばん最後に、最近の話題の見出しを新しい順に${String(CHAT_TOPIC_LIMIT)}件まで、` +
  `${CHAT_TOPICS_OPEN} の行と ${CHAT_TOPICS_CLOSE} の行の間に1行に1件ずつ「- 」で始めて` +
  "書いてください。見出しは20字までの短い言葉にし、ここでも発言を引用しないでください。"

/**
 * `/compact` へそのまま渡す依頼の文面（`SessionDriver.promptWithoutRecord` の `text` に
 * そのまま渡る。記録に残さない口を使うので、この文面自体は雑談のログにも会話のアーカイブにも
 * 残らない）。
 */
export const CHAT_COMPACT_COMMAND = `/compact ${CHAT_COMPACT_INSTRUCTION}`

/**
 * 雑談のログの走行合計を持ち、閾値を超えたターンの終わりに `/compact` を1回送る見張り
 * （`docs/chat-mode.md` 4.9「記憶の圧縮と忘却」）。**駆動1代ぶんの持ち物**で、起こし直すと
 * 作り直す（復元されたログがそのまま新しい圧縮点から先になる）。
 *
 * 数えるのは**前の圧縮点から先だけ**の走行合計で、**`state.records` からは数えない** —
 * `trimToRecentTurns`（`src/shared/session-state.ts`）で直近何ターンかに切り詰められるので、
 * そこから数えると古いターンが落ちるたびに減り、閾値へ一生届かないことがある
 * （雑談は100ターンの窓）。
 */
export type ChatCompactWatch = {
  /** 届いたイベント1件ぶんの文面を走行合計に足す（**雑談モードのときだけ**呼ぶ）。 */
  readonly add: (event: SessionEvent, at: number) => void
  /**
   * 閾値を超えていたら `/compact` を1回送り、走行合計を 0 に戻す（＝そこが新しい圧縮点）。
   *
   * **記録に残さない口（`promptWithoutRecord`）で渡す。** 流れるのは `request` ではなく
   * `turn-started` だけなので、利用者が打っていない `/compact` の文面が雑談のログにも
   * 会話のアーカイブにも並ばない。圧縮が起きたこと自体は、SDK から届く `compact-boundary`
   * （`sdk-message.ts`）が別に画面の区切りへ変換するので、ここで文面を残さなくても失われない。
   *
   * 送信が失敗したときは**その回を諦めて次のターンでまた試す**（走行合計を戻さない。
   * `docs/coding-standards.md`「エラーハンドリング」）。
   */
  readonly requestIfNeeded: (driver: SessionDriver) => void
}

/** {@link ChatCompactWatch} を1代ぶん起こす（`thresholdBytes` は呼び出し側が明示的に渡す）。 */
export function createChatCompactWatch(thresholdBytes: number): ChatCompactWatch {
  let bytesSinceCompact = 0

  return {
    add: (event, at) => {
      bytesSinceCompact += chatLogEventByteSize(event, at)
    },
    requestIfNeeded: (driver) => {
      if (bytesSinceCompact < thresholdBytes) {
        return
      }
      try {
        driver.promptWithoutRecord(CHAT_COMPACT_COMMAND)
        bytesSinceCompact = 0
      } catch {
        // 次のターンでまた閾値を超えていれば試す。
      }
    },
  }
}

/**
 * 写しの本文から最近の話題の見出しを取り出す（書かれた順＝新しい順のまま、
 * {@link CHAT_TOPIC_LIMIT} 件まで）。
 *
 * **最後の `<topics>` から、その後ろの最初の `</topics>` までを読む。** `/compact` の出力は
 * 考えの下書き（`<analysis>`）のあとに本文（`<summary>`）が来るので、下書きにも組があれば
 * 後ろの本文のほうが採られる。**閉じが無い・印が無いときは何も出さない**（途中で切れた
 * 節や、見出しを書かなかった要約から推し量って出さない）。
 *
 * 中身の良し悪しは判定しない。箇条の印を落とし、空行を飛ばすだけ。
 */
export function chatTopics(summary: string): readonly string[] {
  const open = summary.lastIndexOf(CHAT_TOPICS_OPEN)
  if (open === -1) {
    return []
  }

  const start = open + CHAT_TOPICS_OPEN.length
  const close = summary.indexOf(CHAT_TOPICS_CLOSE, start)
  if (close === -1) {
    return []
  }

  return summary
    .slice(start, close)
    .split("\n")
    .map((line) => line.trim().replace(LIST_MARKER, "").trim())
    .filter((topic) => topic !== "")
    .slice(0, CHAT_TOPIC_LIMIT)
}

/**
 * パック1つぶんの写しを読み、最近の話題の見出しにして返す（写しがまだ無い・読めないときは
 * 空）。起こしたとき（`src/session-start.ts`）と、圧縮で写しが新しくなったとき
 * （`src/server/session-driver/adapter/sdk-driver.ts` の `PostCompact` フック）の2か所から呼ばれる。
 * **書いたあとの写しを読み直す**ので、画面に出る見出しは次に起こしたときと同じものになる。
 */
export function readChatTopics(chatSummary: ChatSummary): readonly string[] {
  return chatTopics(chatSummary.read()?.summary ?? "")
}

/**
 * イベント1件ぶんの、雑談のログに乗る文面の UTF-8 バイト数。拾うのは
 * `chatLogEntries`（`src/shared/chat-log.ts`）と同じ2種類（依頼とセリフ）だけで、
 * それ以外は0（画像とツールの入出力は数えない。docs/chat-mode.md 4.9）。
 */
function chatLogEventByteSize(event: SessionEvent, at: number): number {
  // 時刻は数えないが、ログの1件の形に揃えるために添える。
  const time = { kind: "stamped", at } as const
  if (event.kind === "request") {
    return chatLogByteSize([{ speaker: "user", text: event.text, images: event.images, time }])
  }
  if (event.kind === "speech") {
    return chatLogByteSize([
      { speaker: "character", text: event.text, expression: event.expression, time },
    ])
  }
  return 0
}
