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
import { MAX_SESSION_CHOICES, type SessionChoice } from "../../shared/session-choice.ts"
import { type SessionEvent } from "../../shared/session-event.ts"
import { readSessionMark } from "./config.ts"
import { toSessionEvents } from "./sdk-message.ts"

/**
 * 組み直した履歴のターンの終わり。**transcript には `result`（ターンの終わり）が残らない**ので、
 * 終わり方は分からない。成功に倒すのは、失敗の印を出すより「終わったこと」を伝えるほうが
 * 画面の意味に合うため（進行中に見えると入力欄が中断ボタンのまま止まる）。
 */
const RESTORED_TURN_FINISHED: SessionEvent = { kind: "turn-finished", status: "success" }

/** 組み直した再生の終わりの印（{@link toRestoredEvents}）。 */
const HISTORY_RESTORED: SessionEvent = { kind: "history-restored" }

/**
 * 続きから始めるセッションを選ぶ。**印（`tagSession` で付けたもの）のあるもののうち、
 * `lastModified` が最新の1つ**（docs/requirements.md 4.8「鍵」）。
 *
 * `cwd` での絞り込みは呼び出し側（`listSessions({ dir })`）が済ませている前提で、ここは印だけを見る。
 * **目印まで揃えてから比べる**ので（`config.ts` の `readSessionMark`）、昔の印（目印の無いもの・
 * 1文字の `@A`）は同じポートの印と一致する。一覧が空・印が1つも無い・要素の形が壊れているときは
 * undefined（＝新規に起こす）を返す。
 */
export function selectSessionToResume(sessions: unknown, tag: string): string | undefined {
  const matched = markedSessions(sessions).filter((session) => session.tag === tag)
  return matched.reduce<TaggedSession | undefined>(
    (latest, session) =>
      latest === undefined || session.lastModified > latest.lastModified ? session : latest,
    undefined,
  )?.sessionId
}

/**
 * 切り替え先として選べるセッションを一覧にする（**印そのものがセッションの一覧**。別の保存先は
 * 作らない。docs/requirements.md 4.8「鍵」）。**新しい順**に並べ、tsukumo の印を持たないものと、
 * **いまの部屋（渡した `tag`）と違う印のもの**は落とす。
 *
 * `cwd` での絞り込みは呼び出し側（`listSessions({ dir })`）が済ませている前提。**渡す `tag` は
 * {@link selectSessionToResume} と同じ、目印まで揃えた印**（`src/server/core/config.ts` の
 * `sessionTag`）——部屋はビューのポート1つにつき1つなので（`docs/glossary.md`「部屋」）、
 * 切り替え先も自分の部屋のものだけに絞る。**目印まで揃えてから比べる**ので、昔の印（目印の
 * 無いもの・1文字の `@A`）も対応するポートの部屋の一覧に並ぶ。
 *
 * 一覧に並ぶのはいつも同じ部屋（同じ `tag`）のセッションなので、**行が複数あるのは、落ちた
 * tsukumo の印といま動いている tsukumo の印が見分けられないため**（見分け方は最終更新時刻の側）。
 *
 * **返すのは新しいほうから {@link MAX_SESSION_CHOICES} 件まで**（印は使うほど増え続ける）。
 */
export function listMarkedSessions(sessions: unknown, tag: string): readonly SessionChoice[] {
  return markedSessions(sessions)
    .filter((session) => session.tag === tag)
    .map(({ viewPort, sessionId, lastModified, heading }) => ({
      viewPort,
      sessionId,
      lastModified,
      heading,
    }))
    .sort((left, right) => right.lastModified - left.lastModified)
    .slice(0, MAX_SESSION_CHOICES)
}

/**
 * transcript のメッセージ列を内部イベントに変える（メインビューのやり取りと吹き出しのセリフを
 * 組み直すため）。**メッセージ1件の形は SDK のイベントとほぼ同じ**なので、変換の本体は
 * {@link toSessionEvents} に任せ、ここが足すのは transcript には残らない2つだけ:
 *
 * - **利用者の依頼（`request`）**: `user` のテキストブロックから起こす（ツールの結果は除く）
 * - **ターンの境目（`turn-finished`）**: `result` が残らないので、**次の依頼の手前**と
 *   **並びの末尾**で区切る
 * - **再生の終わり（`history-restored`）**: 末尾に1つ。transcript に残る時刻は読む口
 *   （`getSessionMessages`）が落とすので、ここまでの記録は時刻が分からないと畳み込みに伝える
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

  const events = restored.turnOpen ? [...restored.events, RESTORED_TURN_FINISHED] : restored.events
  // **再生の終わりに印を1つ足す**（`history-restored`）。transcript を読む口が時刻を落とすので、
  // ここまでの記録は起きた時刻が分からない（`docs/design.md` 4.2「記録の時刻」）。組み直せた
  // ものが無ければ、書き換える記録も無いので足さない。
  return events.length === 0 ? events : [...events, HISTORY_RESTORED]
}

/** 印の付いたセッション1件（目印まで揃えた印つき）。 */
type TaggedSession = SessionChoice & {
  /**
   * 目印まで揃えた印。**続きから始めるセッションを選ぶときも、切り替え先の一覧をいまの部屋に
   * 絞るときも、これ同士を比べる**（`readSessionMark`）。
   */
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
    ? [
        {
          viewPort: mark.viewPort,
          tag: mark.tag,
          sessionId,
          lastModified,
          heading: headingFrom(value.summary),
        },
      ]
    : []
}

/**
 * SDK の `summary`（外来の値）を行の見出しへ畳む。**文字列でない・空・空白だけなら
 * 無いものとして扱う**（`SessionChoice.heading` のコメント）。
 */
function headingFrom(summary: unknown): string | undefined {
  return typeof summary === "string" && summary.trim() !== "" ? summary : undefined
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
  // 組み直した依頼に画像は付かない（**tsukumo は控えをディスクに残さず、原寸の棚もメモリだけで
  // 起こし直すと空になる**ので、読み直せるのは文面だけ。控えも出ないので、押せる控えも無い。
  // `docs/requirements.md` 4.10）。
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
 * `user` の生のテキストから依頼の文面を組み立てる。**仕掛けが `user` の役で差し込んだ塊は
 * 先に落とす**（{@link withoutInjectedBlocks}）。残りを {@link foldSlashCommand} で入力欄から
 * 打ったときの見え方に畳み、**何も残らなければ依頼ではない**ので undefined にする。
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
 * 仕掛け（Claude Code と tsukumo の外側）が `user` の役で差し込む塊を落とす。
 * **利用者が入力欄に打った文面ではない**ので、組み直した依頼には出さない
 * （docs/requirements.md 4.8）。
 *
 * 生きているセッションでは `request` は入力欄からの送信でだけ起き（`session-manager.ts`）、
 * これらは一度も画面に出ない。**transcript から組み直すときだけ `user` の役として同じ場所に
 * 並んでしまう**ので、ここで揃える。実測で出たのは背景のタスクの知らせ
 * （`<task-notification>`）・ローカルコマンドの断り書き（`<local-command-caveat>`）・
 * 別のエージェントからの伝言（`<agent-message>`）の3つだが、同じ性質のものを合わせて落とす。
 *
 * **塊の丸ごとだけを落とす**（開きと閉じが揃っているもの）ので、利用者の文面に混じっていても
 * その前後は残る。
 */
function withoutInjectedBlocks(text: string): string {
  return text.replace(INJECTED_BLOCK, "").trim()
}

function nonEmpty(text: string): string | undefined {
  return text.trim() === "" ? undefined : text
}
