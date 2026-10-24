// transcript のメッセージ列から、画面の履歴（内部イベント）を組み直す。SDK を呼ばない純粋な部分だけをここに置く。
//
// 読み直す先は claude 自身が書いた transcript（正典）で、tsukumo 側にキャッシュもスナップショットも作らない。
// transcript に残らない入力の種類とターンの終わり方だけは、入力の控え（`InputLedger`）から引く。
// ここを通るのは会話の内容そのものなので、ログにもファイルにも出さない。

import { isPlainObject } from "remeda"

import type { Expression } from "../../../shared/character-pack/expression.ts"
import type { TurnOutcome } from "../../../shared/session-driver/turn-failure.ts"
import type { RestoredEvent, SessionEvent } from "../../../shared/session/session-event.ts"
import { nonBlankString } from "../../../shared/utils/non-blank-string.ts"
import { asideTextOf } from "./aside-prompt.ts"
import { createCallReview } from "./call-review.ts"
import type { InputLedger, LedgeredInputKind, LedgeredTurn } from "./input-ledger.ts"
import { isProgressNudgePrompt } from "./progress-nudge.ts"
import { toSessionEvents } from "./sdk-message.ts"

/**
 * 控えに終わり方の無いターンの終わり方。transcript には `result`（ターンの終わり）が残らない。
 * 完了（`completed`）に倒すのは、失敗の印を出すより「終わったこと」を伝えるほうが画面の意味に合うため（進行中に見えると入力欄が中断ボタンのまま止まる）。
 */
const UNLEDGERED_TURN_OUTCOME: TurnOutcome = { kind: "completed" }

/**
 * transcript のメッセージ列を内部イベントに変える（メインビューのやり取りと吹き出しのセリフを組み直すため）。
 * メッセージ1件の形は SDK のイベントとほぼ同じなので、変換の本体は {@link toSessionEvents} に任せ、ここが足すのは transcript には残らないものだけ:
 *
 * - 委譲先の返却（`origin.handback` が真の `user` メッセージ）: 依頼にもイベントにもしない（`phase_result` で進んだ帯は戻さない）
 * - 利用者の依頼（`request`）と脇の話（`aside`）: 欄で利用者の入力と分かる `user` のテキストブロックから起こす（{@link requestText}）。
 *   依頼・脇の話・進みの差し込みのどれかは、メッセージの `uuid` で控えを引いて決め、控えに無ければ包み（`asideTextOf`・`isProgressNudgePrompt`）で見分ける
 * - 続きのターンの始まり（`turn-resumed`）: バックグラウンドタスクの知らせの `user` メッセージと、進みの差し込みから起こす。差し込みは依頼にしない
 * - ターンの境目（`turn-finished`）: `result` が残らないので、次の依頼・脇の話・続きのターンの手前と並びの末尾で区切る（{@link boundedTurns}）。時刻は直前の出来事のものを引き継ぐ
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
  ledger: InputLedger,
): readonly RestoredEvent[] {
  if (!Array.isArray(messages)) {
    return []
  }

  const steps = messages.flatMap((message): readonly RestoringStep[] => {
    const time = messageTime(message)
    const turn = ledger.turnOf(messageUuid(message) ?? "")
    return restoredMessageEvents(message, expressions, ledger).map((event) => ({
      event,
      time,
      turn,
    }))
  })
  return passThrough(boundedTurns(steps), createCallReview().pass)
}

export function restoredMessageEvents(
  message: unknown,
  expressions: readonly Expression[],
  ledger: InputLedger,
): readonly SessionEvent[] {
  if (isHandback(message)) {
    return []
  }
  if (isTaskNotification(message)) {
    return [{ kind: "turn-resumed" }]
  }
  const text = requestText(message)
  if (text === undefined) {
    return toSessionEvents(message, expressions)
  }
  // 組み直した依頼に画像は付かない。
  // tsukumo は画像の控えをディスクに残さず、原寸の棚もメモリだけで起こし直すと空になるので、読み直せるのは文面だけ。
  switch (ledger.inputKindOf(messageUuid(message) ?? "") ?? kindByWrapping(text)) {
    case "progress-nudge":
      return [{ kind: "turn-resumed" }]
    case "aside":
      return [{ kind: "aside", text: asideTextOf(text) ?? text, images: [] }]
    case "request":
      return [{ kind: "request", text, images: [] }]
  }
}

/** 組み直しの途中の出来事1件。`turn` は元のメッセージの uuid で控えから引いたターン。 */
type RestoringStep = RestoredEvent & { readonly turn: LedgeredTurn | undefined }

/**
 * ターンの境目に `turn-finished` を挟む。
 * 最初の依頼より前には閉じるターンも、続きを始めるターンも無い。
 * 控えで同じターンと分かる入力（ターンの途中で送った脇の話）の手前には挟まない。
 * 終わり方はそのターンで控えから引けたもので、引けなければ {@link UNLEDGERED_TURN_OUTCOME}。
 */
function boundedTurns(steps: readonly RestoringStep[]): readonly RestoredEvent[] {
  let started = false
  let current: LedgeredTurn | undefined = undefined
  let lastTime: RestoredEvent["time"] = UNKNOWN_TIME
  const finished = (time: RestoredEvent["time"]): RestoredEvent => ({
    event: { kind: "turn-finished", outcome: current?.outcome ?? UNLEDGERED_TURN_OUTCOME },
    time,
  })

  const bounded = steps.flatMap(({ event, time, turn }): readonly RestoredEvent[] => {
    const opening = isTurnOpening(event)
    const resumed = event.kind === "turn-resumed"
    if (!started) {
      if (resumed) {
        return []
      }
      lastTime = time
      if (opening) {
        started = true
        current = turn
      }
      return [{ event, time }]
    }
    const boundary = (opening || resumed) && (turn === undefined || turn !== current)
    const closing = boundary ? [finished(lastTime)] : []
    if (boundary || current === undefined) {
      current = turn
    }
    lastTime = time
    return [...closing, { event, time }]
  })
  return started ? [...bounded, finished(lastTime)] : bounded
}

/** 控えの無い入力の種類を、本文の包みで見分ける（控えの無い古いセッションと、控えに無い uuid）。 */
function kindByWrapping(text: string): LedgeredInputKind {
  if (isProgressNudgePrompt(text)) {
    return "progress-nudge"
  }
  return asideTextOf(text) === undefined ? "request" : "aside"
}

function messageUuid(message: unknown): string | undefined {
  return isPlainObject(message) && typeof message.uuid === "string" ? message.uuid : undefined
}

/** 委譲先の返却か。`origin.handback` が真の `user` メッセージ。 */
function isHandback(message: unknown): boolean {
  return (
    isPlainObject(message) &&
    message.type === "user" &&
    isPlainObject(message.origin) &&
    message.origin.handback === true
  )
}

/** 差し戻しの1段を通す。通ったあとの出来事は、元の出来事の時刻を引き継ぐ。差し戻しの記録（`report-rejected`）は使われ方の記録の口なので、復元では出さない。 */
function passThrough(
  events: readonly RestoredEvent[],
  pass: (event: SessionEvent) => readonly SessionEvent[],
): readonly RestoredEvent[] {
  return events.flatMap(({ event, time }) =>
    pass(event)
      .filter((passed) => passed.kind !== "report-rejected")
      .map((passed) => ({ event: passed, time })),
  )
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
 * - `origin` がある: `kind` が `human` のものだけが依頼。駆動は送る依頼に `human` を付ける。
 *   ほかは利用者の入力ではない（実測: `task-notification`・`peer`）。
 *   未知の `kind` も依頼にしないので、SDK が `human` の別名を足すとその依頼は組み直しから落ちる（仕掛けの文面が依頼に出るより害が小さい）
 * - `origin` が無い（駆動が印を付ける前の古い記録）: `is_meta` が真のものは仕掛けが差し込んだもの
 *   （実測: 別のエージェントからの伝言、文脈を畳んだあとの要約）で、依頼ではない
 * - `isCompletedLocalCommand` は SDK がローカルコマンドの行とその出力の両方に付ける。
 *   欄では2つを分けられないので、スラッシュコマンドの形に畳めるものだけを依頼にし、出力（`<local-command-stdout>` など）は依頼にしない
 *
 * 欄が無く見分けられずに依頼に出るのは、CLI の `!` で打った `<bash-input>`・`<bash-stdout>` だけ。
 */
function requestText(message: unknown): string | undefined {
  if (!isPlainObject(message) || !isUserInput(message)) {
    return undefined
  }
  const raw = userRawText(message)?.trim()
  if (raw === undefined) {
    return undefined
  }
  return message.isCompletedLocalCommand === true
    ? slashCommandLine(raw)
    : nonBlankString(slashCommandLine(raw) ?? raw)
}

function isUserInput(message: Readonly<Record<string, unknown>>): boolean {
  if (message.origin !== undefined) {
    return isPlainObject(message.origin) && message.origin.kind === "human"
  }
  return message.is_meta !== true
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
