// 前のセッションの続きから始めるための計算（docs/requirements.md 4.8）。**SDK を呼ばない
// 純粋な部分だけ**をここに置き、`listSessions` / `getSessionMessages` を実際に呼ぶのは駆動側
// （src/server/adapter/sdk-driver.ts）。純粋なので、本物の claude を起こさずにテストできる。
//
// 戻すのは (1) どのセッションの続きから始めるか（印と `lastModified` で選ぶ）と
// (2) 画面の履歴（transcript のメッセージ列 → 内部イベント）の2つ。
//
// **読み直す先は claude 自身が書いた transcript（正典）**で、tsukumo 側にキャッシュも
// スナップショットも作らない。ここを通るのは会話の内容そのものなので、ログにもファイルにも
// 出さない（docs/coding-standards.md「会話内容の扱い」）。

import { isPlainObject } from "remeda"

import { type Expression } from "../../shared/expression.ts"
import { type SessionEvent } from "../../shared/session-event.ts"
import { readSessionMark } from "./config.ts"
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
 * **目印まで揃えてから比べる**ので（`config.ts` の `readSessionMark`）、目印の無い昔の印は
 * `@A` の印と一致する。一覧が空・印が1つも無い・要素の形が壊れているときは undefined
 * （＝新規に起こす）を返す。
 */
export function selectSessionToResume(sessions: unknown, tag: string): string | undefined {
  const matched = markedSessions(sessions).filter((session) => session.tag === tag)
  return matched.reduce<TaggedSession | undefined>(
    (latest, session) =>
      latest === undefined || session.lastModified > latest.lastModified ? session : latest,
    undefined,
  )?.sessionId
}

/** 印の付いたセッション1件（画面に並べるのに要る3つだけ）。 */
export type MarkedSession = {
  /** 目印（`A` / `B` / …。`src/server/core/config.ts` の {@link readSessionMark}）。 */
  readonly slot: string
  readonly sessionId: string
  readonly lastModified: number
}

/**
 * 印の付いたセッションを一覧にする（**印そのものがセッションの一覧**。別の保存先は作らない。
 * docs/requirements.md 4.8「鍵」）。**新しい順**に並べ、tsukumo の印を持たないものは落とす。
 *
 * `cwd` での絞り込みは呼び出し側（`listSessions({ dir })`）が済ませている前提。パックとモードで
 * 分かれた印は目印だけに畳むので、**同じ目印の行が複数返ることがある**（まとめ方と見せ方は
 * 画面側の判断）。
 */
export function listMarkedSessions(sessions: unknown): readonly MarkedSession[] {
  return markedSessions(sessions)
    .map(({ slot, sessionId, lastModified }) => ({ slot, sessionId, lastModified }))
    .sort((left, right) => right.lastModified - left.lastModified)
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

/** 印の付いたセッション1件（目印まで揃えた印つき）。 */
type TaggedSession = MarkedSession & {
  /** 目印まで揃えた印。**選ぶときはこれ同士を比べる**（`readSessionMark`）。 */
  readonly tag: string
}

/**
 * 一覧を、印の付いたセッションの並びにする。**tsukumo の印を持たないもの・形が壊れているものは
 * 落とす**（同じ cwd の素の `claude` のセッションはここで消える）。一覧そのものが配列で
 * なければ空。
 */
function markedSessions(sessions: unknown): readonly TaggedSession[] {
  return Array.isArray(sessions) ? sessions.flatMap((session) => taggedSession(session)) : []
}

/**
 * 一覧の要素1つを、印の付いたセッションとして受け取る。読めないものは**空の並び**にして落とす。
 */
function taggedSession(value: unknown): readonly TaggedSession[] {
  if (!isPlainObject(value) || typeof value.tag !== "string") {
    return []
  }

  const mark = readSessionMark(value.tag)
  const sessionId = value.sessionId
  const lastModified = value.lastModified
  return mark !== undefined &&
    typeof sessionId === "string" &&
    sessionId !== "" &&
    typeof lastModified === "number" &&
    Number.isFinite(lastModified)
    ? [{ slot: mark.slot, tag: mark.tag, sessionId, lastModified }]
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
  // 組み直した依頼に画像は付かない（**tsukumo は原寸も控えもどこにも残していない**ので、
  // 読み直せるのは文面だけ。`docs/requirements.md` 4.10）。
  return text === undefined
    ? toSessionEvents(message, expressions)
    : [{ kind: "request", text, images: [] }]
}

/**
 * `user` のメッセージから利用者の依頼の文面を取り出す。**ツールの結果（`tool_result`）は
 * 依頼ではない**ので undefined を返し、呼び出し側が {@link toSessionEvents} 側の変換に回す。
 */
function requestText(message: unknown): string | undefined {
  if (!isPlainObject(message) || message.type !== "user" || !isPlainObject(message.message)) {
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
 * `user` の生のテキストから依頼の文面を組み立てる。**`<local-command-stdout>` だけの
 * メッセージ**（`/model` などローカルコマンドの出力）は依頼ではないので undefined にし、
 * それ以外は {@link foldSlashCommand} で入力欄からの見え方に畳んでから返す。
 */
function requestTextFromRawText(text: string): string | undefined {
  return isLocalCommandStdoutOnly(text) ? undefined : nonEmpty(foldSlashCommand(text))
}

const COMMAND_TAG = /<(command-name|command-message|command-args)>[\s\S]*?<\/\1>/g
const COMMAND_NAME_TAG = /<command-name>([\s\S]*?)<\/command-name>/
const COMMAND_ARGS_TAG = /<command-args>([\s\S]*?)<\/command-args>/
const LOCAL_COMMAND_STDOUT_TAG = /<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g

/**
 * SDK が展開したスラッシュコマンド（`<command-name>` / `<command-message>` /
 * `<command-args>` の3タグ。**並びと `<command-message>` の有無は入り方によって違う**）を、
 * 入力欄から打ったときと同じ `/<name> <args>` の1行に畳む。`<command-message>` は
 * `<command-name>` と同じ名前の重複なので落とす。
 *
 * **メッセージ全体がこれらのタグだけで出来ているときだけ畳む**（地の文の途中にたまたま
 * タグが混じっている壊れた形は、素通しに倒して安全側に振る）。`<command-name>` が
 * 無ければ何もしない。
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
 * メッセージ全体が `<local-command-stdout>` だけで出来ているかどうか（ローカルコマンドの
 * 出力で、利用者の依頼ではない）。
 */
function isLocalCommandStdoutOnly(text: string): boolean {
  return (
    text.includes("<local-command-stdout>") &&
    text.replace(LOCAL_COMMAND_STDOUT_TAG, "").trim() === ""
  )
}

function nonEmpty(text: string): string | undefined {
  return text.trim() === "" ? undefined : text
}
