// transcript のメッセージ列から、画面の履歴（内部イベント）を組み直す。SDK を呼ばない純粋な部分だけをここに置く。
//
// 読み直す先は claude 自身が書いた transcript（正典）で、tsukumo 側にキャッシュもスナップショットも作らない。
// ここを通るのは会話の内容そのものなので、ログにもファイルにも出さない。

import { isPlainObject } from "remeda"

import type { Expression } from "../../../shared/character-pack/expression.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { createReportReview } from "../../report/core/report-review.ts"
import { toSessionEvents } from "./sdk-message.ts"
import { createSpeechReview } from "./speech-review.ts"
import { createWorkPlanReview } from "./work-plan-review.ts"

/**
 * 組み直した履歴のターンの終わり。transcript には `result`（ターンの終わり）が残らないので、終わり方は分からない。
 * 完了（`completed`）に倒すのは、失敗の印を出すより「終わったこと」を伝えるほうが画面の意味に合うため（進行中に見えると入力欄が中断ボタンのまま止まる）。
 */
const RESTORED_TURN_FINISHED: SessionEvent = {
  kind: "turn-finished",
  outcome: { kind: "completed" },
}

/** 組み直した再生の終わりの印（{@link toRestoredEvents}）。 */
const HISTORY_RESTORED: SessionEvent = { kind: "history-restored" }

/**
 * transcript のメッセージ列を内部イベントに変える（メインビューのやり取りと吹き出しのセリフを組み直すため）。
 * メッセージ1件の形は SDK のイベントとほぼ同じなので、変換の本体は {@link toSessionEvents} に任せ、ここが足すのは transcript には残らない3つだけ:
 *
 * - 利用者の依頼（`request`）: `user` のテキストブロックから起こす（ツールの結果は除く）
 * - ターンの境目（`turn-finished`）: `result` が残らないので、次の依頼の手前と並びの末尾で区切る
 * - 最後のやり取りの時刻（`restored-turn-span`）: 最後の依頼のメッセージと、並びの最後のメッセージの `timestamp`。
 *   入力欄と進み具合の帯の「所要」が、起こし直した時刻ではなく本当にかかった時間を出すため。どちらかが読めなければ足さない
 * - 再生の終わり（`history-restored`）: 末尾に1つ。
 *   個々の記録の時刻までは組み直さないので、ここまでの記録は時刻が分からないと畳み込みに伝える
 *
 * 差し戻された `speak` / `report` / `work_plan` の呼び出しも transcript には残るので、動いているときと同じく差し戻し（`SpeechReview.pass` → `ReportReview.pass` → `WorkPlanReview.pass`）に通して落とす。
 *
 * 壊れた要素は {@link toSessionEvents} が空の並びに倒すので、読めたものだけが残る。
 */
export function toRestoredEvents(
  messages: unknown,
  expressions: readonly Expression[],
): readonly SessionEvent[] {
  if (!Array.isArray(messages)) {
    return []
  }

  const converted = messages.flatMap((message) => restoredMessageEvents(message, expressions))
  // 最初の依頼より前には閉じるターンが無い。
  const firstRequest = converted.findIndex((event) => event.kind === "request")
  const bounded = converted.flatMap((event, index) =>
    event.kind === "request" && index > firstRequest ? [RESTORED_TURN_FINISHED, event] : [event],
  )
  const closed = firstRequest === -1 ? bounded : [...bounded, RESTORED_TURN_FINISHED]
  const speechReview = createSpeechReview()
  const reportReview = createReportReview()
  const workPlanReview = createWorkPlanReview()
  const events = closed
    .flatMap((event) => speechReview.pass(event))
    .flatMap((event) => reportReview.pass(event))
    .flatMap((event) => workPlanReview.pass(event))
  // 組み直せたものが無ければ、書き換える記録も無いので `history-restored` を足さない。
  return events.length === 0
    ? events
    : [...events, ...lastTurnSpanEvents(messages), HISTORY_RESTORED]
}

export function restoredMessageEvents(
  message: unknown,
  expressions: readonly Expression[],
): readonly SessionEvent[] {
  const text = requestText(message)
  // 組み直した依頼に画像は付かない。
  // tsukumo は控えをディスクに残さず、原寸の棚もメモリだけで起こし直すと空になるので、読み直せるのは文面だけ。
  return text === undefined
    ? toSessionEvents(message, expressions)
    : [{ kind: "request", text, images: [] }]
}

/**
 * 最後のやり取りの始まり（最後の依頼のメッセージ）と終わり（並びの最後のメッセージ）の時刻。
 * `timestamp` は `SessionMessage` の型には無いが、`getSessionMessages` が transcript の各行のものを載せて返す（実測）。
 */
function lastTurnSpanEvents(messages: readonly unknown[]): readonly SessionEvent[] {
  const lastRequest = messages.findLast((message) => requestText(message) !== undefined)
  const startedAt = lastRequest === undefined ? undefined : messageTime(lastRequest)
  const finishedAt = messageTime(messages.at(-1))
  return startedAt === undefined || finishedAt === undefined || finishedAt < startedAt
    ? []
    : [{ kind: "restored-turn-span", startedAt, finishedAt }]
}

/** メッセージの `timestamp`（ISO 8601）をエポックミリ秒に直す。無い・読めない綴りは `undefined`。 */
function messageTime(message: unknown): number | undefined {
  if (!isPlainObject(message) || typeof message.timestamp !== "string") {
    return undefined
  }
  try {
    return Temporal.Instant.from(message.timestamp).epochMilliseconds
  } catch {
    return undefined
  }
}

/**
 * `user` のメッセージから利用者の依頼の文面を取り出す。
 * ツールの結果（`tool_result`）は依頼ではないので undefined を返し、呼び出し側が {@link toSessionEvents} 側の変換に回す。
 * `is_meta` が真のメッセージは仕掛けが差し込んだもので（実測: 別のエージェントからの伝言とその前後の断り書き、文脈を畳んだあとの要約）、タグの外にも定型の文面を持つので、丸ごと依頼にしない。
 */
function requestText(message: unknown): string | undefined {
  if (
    !isPlainObject(message) ||
    message.type !== "user" ||
    message.is_meta === true ||
    !isPlainObject(message.message)
  ) {
    return undefined
  }

  const content = message.message.content
  if (typeof content === "string") {
    return requestTextFromRawText(content)
  }
  if (!Array.isArray(content) || content.some((block) => isToolResultBlock(block))) {
    return undefined
  }

  return requestTextFromRawText(content.map((block) => textBlock(block)).join("\n"))
}

function isToolResultBlock(block: unknown): boolean {
  return isPlainObject(block) && block.type === "tool_result"
}

function textBlock(block: unknown): string {
  return isPlainObject(block) && block.type === "text" && typeof block.text === "string"
    ? block.text
    : ""
}

/**
 * `user` の生のテキストから依頼の文面を組み立てる。
 * 仕掛けが `user` の役で差し込んだ塊は先に落とす（{@link withoutInjectedBlocks}）。
 * 残りを {@link foldSlashCommand} で入力欄から打ったときの見え方に畳み、何も残らなければ依頼ではないので undefined にする。
 */
function requestTextFromRawText(text: string): string | undefined {
  return nonEmpty(foldSlashCommand(withoutInjectedBlocks(text)))
}

const COMMAND_TAG = /<(command-name|command-message|command-args)>[\s\S]*?<\/\1>/g
const COMMAND_NAME_TAG = /<command-name>([\s\S]*?)<\/command-name>/
const COMMAND_ARGS_TAG = /<command-args>([\s\S]*?)<\/command-args>/
/** {@link withoutInjectedBlocks} が落とす塊。開きと閉じが揃っているものだけに当てる。 */
const INJECTED_BLOCK =
  /<(system-reminder|task-notification|local-command-caveat|local-command-stdout|agent-message|cross-session-message)(\s[^>]*)?>[\s\S]*?<\/\1>/g

/**
 * SDK が展開したスラッシュコマンド（`<command-name>` / `<command-message>` / `<command-args>` の3タグ。並びと `<command-message>` の有無は入り方によって違う）を、入力欄から打ったときと同じ `/<name> <args>` の1行に畳む。
 * `<command-message>` は `<command-name>` と同じ名前の重複なので落とす。
 *
 * メッセージ全体がこれらのタグだけで出来ているときだけ畳む（地の文の途中にたまたまタグが混じっている壊れた形は、素通しに倒して安全側に振る）。
 * `<command-name>` が無ければ何もしない。
 */
function foldSlashCommand(text: string): string {
  const name = text.match(COMMAND_NAME_TAG)?.[1]
  if (name === undefined || text.replace(COMMAND_TAG, "").trim() !== "") {
    return text
  }

  const args = text.match(COMMAND_ARGS_TAG)?.[1]?.trim()
  return args === undefined || args === "" ? name : `${name} ${args}`
}

/**
 * 仕掛け（Claude Code と tsukumo の外側）が `user` の役で差し込む塊を落とす。
 * 利用者が入力欄に打った文面ではないので、組み直した依頼には出さない。
 *
 * 生きているセッションでは `request` は入力欄からの送信でだけ起き、これらは一度も画面に出ない。
 * transcript から組み直すときだけ `user` の役として同じ場所に並んでしまうので、ここで揃える。
 * 実測で出たのは背景のタスクの知らせ（`<task-notification>`）・ローカルコマンドの断り書き（`<local-command-caveat>`）・別のエージェントからの伝言（`<agent-message>`）の3つだが、同じ性質のものを合わせて落とす。
 *
 * 塊の丸ごとだけを落とす（開きと閉じが揃っているもの）ので、利用者の文面に混じっていてもその前後は残る。
 */
function withoutInjectedBlocks(text: string): string {
  return text.replace(INJECTED_BLOCK, "").trim()
}

function nonEmpty(text: string): string | undefined {
  return text.trim() === "" ? undefined : text
}
