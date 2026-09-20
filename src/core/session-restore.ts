// 前のセッションの続きから始めるための計算（docs/requirements.md 4.8）。**SDK を呼ばない
// 純粋な部分だけ**をここに置き、`listSessions` / `getSessionMessages` を実際に呼ぶのは駆動側
// （src/adapter/sdk-driver.ts）。純粋なので、本物の claude を起こさずにテストできる。
//
// 戻すのは (1) どのセッションの続きから始めるか（印と `lastModified` で選ぶ）と
// (2) 画面の履歴（transcript のメッセージ列 → 内部イベント）の2つ。
//
// **読み直す先は claude 自身が書いた transcript（正典）**で、tsukumo 側にキャッシュも
// スナップショットも作らない。ここを通るのは会話の内容そのものなので、ログにもファイルにも
// 出さない（docs/coding-standards.md「会話内容の扱い」）。

import { type Expression } from "../shared/expression.ts"
import { type SessionEvent } from "../shared/session-event.ts"
import { toSessionEvents } from "./sdk-message.ts"

/**
 * 組み直した履歴のターンの終わり。**transcript には `result`（ターンの終わり）が残らない**ので、
 * 終わり方は分からない。成功に倒すのは、失敗の印を出すより「終わったこと」を伝えるほうが
 * 画面の意味に合うため（進行中に見えると入力欄が中断ボタンのまま止まる）。
 */
const RESTORED_TURN_FINISHED: SessionEvent = { kind: "turn-finished", status: "success" }

/**
 * 続きから始めるセッションを選ぶ。**印（`tagSession` で付けたもの）のあるもののうち、
 * `lastModified` が最新の1つ**（docs/requirements.md 4.8「鍵」）。
 *
 * `cwd` での絞り込みは呼び出し側（`listSessions({ dir })`）が済ませている前提で、ここは印だけを見る。
 * 一覧が空・印が1つも無い・要素の形が壊れているときは undefined（＝新規に起こす）を返す。
 */
export function selectSessionToResume(sessions: unknown, tag: string): string | undefined {
  if (!Array.isArray(sessions)) {
    return undefined
  }

  const tagged = sessions.flatMap((session) => taggedSession(session, tag))
  return tagged.reduce<TaggedSession | undefined>(
    (latest, session) =>
      latest === undefined || session.lastModified > latest.lastModified ? session : latest,
    undefined,
  )?.sessionId
}

/**
 * transcript のメッセージ列を内部イベントに変える（メインビューのやり取りと吹き出しのセリフを
 * 組み直すため）。**メッセージ1件の形は SDK のイベントとほぼ同じ**なので、変換の本体は
 * {@link toSessionEvents} に任せ、ここが足すのは transcript には残らない2つだけ:
 *
 * - **利用者の依頼（`request`）**: `user` のテキストブロックから起こす（ツールの結果は除く）
 * - **ターンの境目（`turn-finished`）**: `result` が残らないので、**次の依頼の手前**と
 *   **並びの末尾**で区切る
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

  const restored = messages
    .flatMap((message) => restoredMessageEvents(message, expressions))
    .reduce<RestoredTurns>(appendWithTurnBoundary, { events: [], turnOpen: false })

  return restored.turnOpen ? [...restored.events, RESTORED_TURN_FINISHED] : restored.events
}

/** 印の付いたセッション1件（選ぶのに要る2つだけ）。 */
type TaggedSession = {
  readonly sessionId: string
  readonly lastModified: number
}

/**
 * 一覧の要素1つを、印の付いたセッションとして受け取る。**印が違う・形が壊れているものは
 * 空の並び**にして落とす（同じ cwd の素の `claude` のセッションはここで消える）。
 */
function taggedSession(value: unknown, tag: string): readonly TaggedSession[] {
  if (!isRecord(value) || value.tag !== tag) {
    return []
  }

  const sessionId = value.sessionId
  const lastModified = value.lastModified
  return typeof sessionId === "string" &&
    sessionId !== "" &&
    typeof lastModified === "number" &&
    Number.isFinite(lastModified)
    ? [{ sessionId, lastModified }]
    : []
}

/** 組み直しの途中の姿（今のターンが開いたままかどうかを持ち回る）。 */
type RestoredTurns = {
  readonly events: readonly SessionEvent[]
  readonly turnOpen: boolean
}

/** イベントを1件積む。**依頼の手前で、開いたままのターンを閉じる**。 */
function appendWithTurnBoundary(turns: RestoredTurns, event: SessionEvent): RestoredTurns {
  if (event.kind !== "request") {
    return { events: [...turns.events, event], turnOpen: turns.turnOpen }
  }

  return {
    events: turns.turnOpen
      ? [...turns.events, RESTORED_TURN_FINISHED, event]
      : [...turns.events, event],
    turnOpen: true,
  }
}

function restoredMessageEvents(
  message: unknown,
  expressions: readonly Expression[],
): readonly SessionEvent[] {
  const text = requestText(message)
  return text === undefined ? toSessionEvents(message, expressions) : [{ kind: "request", text }]
}

/**
 * `user` のメッセージから利用者の依頼の文面を取り出す。**ツールの結果（`tool_result`）は
 * 依頼ではない**ので undefined を返し、呼び出し側が {@link toSessionEvents} 側の変換に回す。
 */
function requestText(message: unknown): string | undefined {
  if (!isRecord(message) || message.type !== "user" || !isRecord(message.message)) {
    return undefined
  }

  const content = message.message.content
  if (typeof content === "string") {
    return nonEmpty(content)
  }
  if (!Array.isArray(content) || content.some((block) => isToolResultBlock(block))) {
    return undefined
  }

  return nonEmpty(content.map((block) => textBlock(block)).join("\n"))
}

function isToolResultBlock(block: unknown): boolean {
  return isRecord(block) && block.type === "tool_result"
}

function textBlock(block: unknown): string {
  return isRecord(block) && block.type === "text" && typeof block.text === "string"
    ? block.text
    : ""
}

function nonEmpty(text: string): string | undefined {
  return text.trim() === "" ? undefined : text
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
