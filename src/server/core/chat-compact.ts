// tsukumo が雑談モードの記憶を畳むときに送る `/compact` の文面と、その結果（要約の写し）から
// 最近の話題の見出しを読み出す口（`docs/chat-mode.md` 4.9「記憶の圧縮と忘却」）。
// `chat-manner.ts` の隣に置く（モデルに見せる文面は core 側）。
//
// **依頼の文面と読み出しを同じファイルに置く**のは、見出しを挟む印（`<topics>`）の形を両側で
// 1つに保つため。文面だけ変えて読み出しが黙って空になる、を起こさない。
//
// 閾値を超えたかどうかの判断と、実際に送る操作は `src/server/core/session-manager.ts` が持つ。
// 写しのファイルに触るのは `src/server/adapter/chat-summary.ts`。ここは「決める」内容だけで、
// 外の世界には触らない（原則2）。

import { type ChatSummary } from "./session-driver.ts"

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
 * （先頭側）の行から落ちる（`src/server/adapter/chat-summary.ts`）ので、末尾に置けば見出しの
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
 * （`src/server/adapter/sdk-driver.ts` の `PostCompact` フック）の2か所から呼ばれる。
 * **書いたあとの写しを読み直す**ので、画面に出る見出しは次に起こしたときと同じものになる。
 */
export function readChatTopics(chatSummary: ChatSummary): readonly string[] {
  return chatTopics(chatSummary.read()?.summary ?? "")
}
