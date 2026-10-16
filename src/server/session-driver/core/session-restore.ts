// transcript のメッセージ列から、画面の履歴（内部イベント）を組み直す。SDK を呼ばない純粋な部分だけをここに置く。
//
// 読み直す先は claude 自身が書いた transcript（正典）で、tsukumo 側にキャッシュもスナップショットも作らない。
// ここを通るのは会話の内容そのものなので、ログにもファイルにも出さない。

import { isPlainObject } from "remeda"

import type { Expression } from "../../../shared/character-pack/expression.ts"
import { parseDelegateReturn } from "../../../shared/session/delegate-return.ts"
import type { RestoredEvent, SessionEvent } from "../../../shared/session/session-event.ts"
import { asideTextOf } from "./aside-prompt.ts"
import { createCallReview } from "./call-review.ts"
import { toSessionEvents } from "./sdk-message.ts"

/**
 * 組み直した履歴のターンの終わり。transcript には `result`（ターンの終わり）が残らないので、終わり方は分からない。
 * 完了（`completed`）に倒すのは、失敗の印を出すより「終わったこと」を伝えるほうが画面の意味に合うため（進行中に見えると入力欄が中断ボタンのまま止まる）。
 */
const RESTORED_TURN_FINISHED: SessionEvent = {
  kind: "turn-finished",
  outcome: { kind: "completed" },
}

/**
 * transcript のメッセージ列を内部イベントに変える（メインビューのやり取りと吹き出しのセリフを組み直すため）。
 * メッセージ1件の形は SDK のイベントとほぼ同じなので、変換の本体は {@link toSessionEvents} に任せ、ここが足すのは transcript には残らない2つだけ:
 *
 * - 委譲先の返却（`delegate-returned`）: `origin.handback` が真の `user` メッセージから、`origin.body` の字下げした行の1行目を読む（依頼にはしない）
 * - 利用者の依頼（`request`）と脇の話（`aside`）: 欄で利用者の入力と分かる `user` のテキストブロックから起こす（{@link requestText}）。脇の話は `asideTextOf` の包みで見分ける
 * - 続きのターンの始まり（`turn-resumed`）: バックグラウンドタスクの知らせの `user` メッセージから起こす
 * - ターンの境目（`turn-finished`）: `result` が残らないので、次の依頼・脇の話・続きのターンの手前と並びの末尾で区切る。時刻は直前の出来事のものを引き継ぐ
 *
 * 出来事ごとの時刻は、元のメッセージの `timestamp`（読めなければ `unknown`）。
 * 読めない出来事の時刻は推し量らない。
 *
 * 差し戻された `speak` / `report` / `work_plan` の呼び出しも transcript には残るので、動いているときと同じく差し戻し（`CallReview.pass`）に通して落とす。
 *
 * 壊れた要素は {@link toSessionEvents} が空の並びに倒すので、読めたものだけが残る。
 */
export function toRestoredEvents(
  messages: unknown,
  expressions: readonly Expression[],
): readonly RestoredEvent[] {
  if (!Array.isArray(messages)) {
    return []
  }

  const converted = messages.flatMap((message): readonly RestoredEvent[] => {
    const time = messageTime(message)
    return restoredMessageEvents(message, expressions).map((event) => ({ event, time }))
  })
  // 最初の依頼より前には閉じるターンも、続きを始めるターンも無い。
  const firstRequest = converted.findIndex(({ event }) => isTurnOpening(event))
  const bounded = converted.flatMap((restored, index): readonly RestoredEvent[] => {
    const afterFirst = firstRequest !== -1 && index > firstRequest
    if (restored.event.kind === "turn-resumed" && !afterFirst) {
      return []
    }
    return afterFirst && (isTurnOpening(restored.event) || restored.event.kind === "turn-resumed")
      ? [
          { event: RESTORED_TURN_FINISHED, time: converted[index - 1]?.time ?? restored.time },
          restored,
        ]
      : [restored]
  })
  const closed =
    firstRequest === -1
      ? bounded
      : [
          ...bounded,
          { event: RESTORED_TURN_FINISHED, time: converted.at(-1)?.time ?? UNKNOWN_TIME },
        ]
  return passThrough(closed, createCallReview().pass)
}

export function restoredMessageEvents(
  message: unknown,
  expressions: readonly Expression[],
): readonly SessionEvent[] {
  const handback = handbackOf(message)
  if (handback !== undefined) {
    return [
      {
        kind: "delegate-returned",
        delegate: handback.from,
        handback: parseDelegateReturn(handback.body),
      },
    ]
  }
  if (isTaskNotification(message)) {
    return [{ kind: "turn-resumed" }]
  }
  const text = requestText(message)
  if (text === undefined) {
    return toSessionEvents(message, expressions)
  }
  // 組み直した依頼に画像は付かない。
  // tsukumo は控えをディスクに残さず、原寸の棚もメモリだけで起こし直すと空になるので、読み直せるのは文面だけ。
  const aside = asideTextOf(text)
  return aside === undefined
    ? [{ kind: "request", text, images: [] }]
    : [{ kind: "aside", text: aside, images: [] }]
}

/**
 * 委譲先の返却の本文と返した委譲先。`origin.handback` が真の `user` メッセージの `origin.body` のうち、字下げ付きの行だけが返却の本文。
 * 返却だが本文が読めないときは本文が空の文字列、`origin.from` が読めなければ委譲先が空の文字列。返却でなければ undefined。
 */
function handbackOf(
  message: unknown,
): { readonly body: string; readonly from: string } | undefined {
  if (!isPlainObject(message) || message.type !== "user" || !isPlainObject(message.origin)) {
    return undefined
  }
  const { origin } = message
  if (origin.handback !== true) {
    return undefined
  }
  const body =
    typeof origin.body === "string"
      ? origin.body
          .split(/\r?\n/u)
          .filter((line) => /^\s/u.test(line))
          .join("\n")
      : ""
  return { body, from: typeof origin.from === "string" ? origin.from : "" }
}

/** 差し戻しの1段を通す。通ったあとの出来事は、元の出来事の時刻を引き継ぐ。 */
function passThrough(
  events: readonly RestoredEvent[],
  pass: (event: SessionEvent) => readonly SessionEvent[],
): readonly RestoredEvent[] {
  return events.flatMap(({ event, time }) => pass(event).map((passed) => ({ event: passed, time })))
}

function isTurnOpening(event: SessionEvent): boolean {
  return event.kind === "request" || event.kind === "aside"
}

/**
 * バックグラウンドタスクの知らせの `user` メッセージか（`origin.kind` が `task-notification`）。本文は見ない。
 * claude はこれを受けて依頼なしで続きのターンを始めるので、組み直しではここで続きのターン（`turn-resumed`）を区切る。
 * `origin` の無い古い形の知らせは続きのターンにならない（実測: 881 件の transcript の知らせはすべて `origin` を持つ）。
 */
function isTaskNotification(message: unknown): boolean {
  return (
    isPlainObject(message) &&
    message.type === "user" &&
    isPlainObject(message.origin) &&
    message.origin.kind === "task-notification"
  )
}

const UNKNOWN_TIME: RestoredEvent["time"] = { kind: "unknown" }

/**
 * メッセージの `timestamp`（ISO 8601）を読む。無い・読めない綴りは `unknown`。
 * `timestamp` は `SessionMessage` の型には無いが、`getSessionMessages` が transcript の各行のものを載せて返す（実測）。
 */
function messageTime(message: unknown): RestoredEvent["time"] {
  if (!isPlainObject(message) || typeof message.timestamp !== "string") {
    return UNKNOWN_TIME
  }
  try {
    return { kind: "known", at: Temporal.Instant.from(message.timestamp).epochMilliseconds }
  } catch {
    return UNKNOWN_TIME
  }
}

/**
 * `user` のメッセージから利用者の依頼の文面を取り出す。依頼でなければ undefined を返し、呼び出し側が {@link toSessionEvents} 側の変換に回す。
 * 見分けるのはメッセージの欄で、本文のタグは削らない（利用者が同じ名前のタグを打っても文面が残る）。
 *
 * - ツールの結果（`tool_result`）は依頼ではない
 * - `is_meta` が真のメッセージは仕掛けが差し込んだもの（実測: 別のエージェントからの伝言、文脈を畳んだあとの要約）
 * - `origin` があり `kind` が `human` でないメッセージは利用者の入力ではない（実測: `task-notification`・`peer`）。
 *   未知の `kind` も依頼にしないので、SDK が `human` の別名を足すとその依頼は組み直しから落ちる（仕掛けの文面が依頼に出るより害が小さい）
 * - `isCompletedLocalCommand` は SDK がローカルコマンドの行とその出力の両方に付ける。
 *   欄では2つを分けられないので、スラッシュコマンドの形に畳めるものだけを依頼にし、出力（`<local-command-stdout>` など）は依頼にしない
 *
 * tsukumo から送った依頼は `is_meta` も `origin` も持たない（実測）。
 * 欄が無く見分けられずに依頼に出るのは、CLI の `!` で打った `<bash-input>`・`<bash-stdout>` だけ。
 */
function requestText(message: unknown): string | undefined {
  if (
    !isPlainObject(message) ||
    message.is_meta === true ||
    (message.origin !== undefined &&
      !(isPlainObject(message.origin) && message.origin.kind === "human"))
  ) {
    return undefined
  }
  const raw = userRawText(message)?.trim()
  if (raw === undefined) {
    return undefined
  }
  return message.isCompletedLocalCommand === true
    ? slashCommandLine(raw)
    : nonEmpty(slashCommandLine(raw) ?? raw)
}

/** `user` のメッセージの生のテキスト。`user` でない・ツールの結果を含むメッセージは undefined。 */
function userRawText(message: unknown): string | undefined {
  if (!isPlainObject(message) || message.type !== "user" || !isPlainObject(message.message)) {
    return undefined
  }
  const content = message.message.content
  if (typeof content === "string") {
    return content
  }
  if (!Array.isArray(content) || content.some((block) => isToolResultBlock(block))) {
    return undefined
  }
  return content.map((block) => textBlock(block)).join("\n")
}

function isToolResultBlock(block: unknown): boolean {
  return isPlainObject(block) && block.type === "tool_result"
}

function textBlock(block: unknown): string {
  return isPlainObject(block) && block.type === "text" && typeof block.text === "string"
    ? block.text
    : ""
}

const COMMAND_TAG = /<(command-name|command-message|command-args)>[\s\S]*?<\/\1>/g
const COMMAND_NAME_TAG = /<command-name>([\s\S]*?)<\/command-name>/
const COMMAND_ARGS_TAG = /<command-args>([\s\S]*?)<\/command-args>/

/**
 * SDK が展開したスラッシュコマンド（`<command-name>` / `<command-message>` / `<command-args>` の3タグ。並びと `<command-message>` の有無は入り方によって違う）を、入力欄から打ったときと同じ `/<name> <args>` の1行に畳む。
 * `<command-message>` は `<command-name>` と同じ名前の重複なので落とす。
 *
 * メッセージ全体がこれらのタグだけで出来ているときだけ畳む。
 * `<command-name>` が無い・タグの外に字があるときは undefined。
 */
function slashCommandLine(text: string): string | undefined {
  const name = text.match(COMMAND_NAME_TAG)?.[1]
  if (name === undefined || text.replace(COMMAND_TAG, "").trim() !== "") {
    return undefined
  }

  const args = text.match(COMMAND_ARGS_TAG)?.[1]?.trim()
  return args === undefined || args === "" ? name : `${name} ${args}`
}

function nonEmpty(text: string): string | undefined {
  return text.trim() === "" ? undefined : text
}
