// 前のセッションの続きから始めるための計算（docs/requirements.md 4.8）。SDK を呼ばない
// 純粋な部分だけをここに置き、`listSessions` / `getSessionMessages` を実際に呼ぶのは
// src/server/session-driver/adapter/sdk-session.ts。純粋なので、本物の claude を起こさずにテストできる。
//
// 戻すのは (1) どのセッションの続きから始めるか（印と `lastModified` で選ぶ）と
// (2) 画面の履歴（transcript のメッセージ列 → 内部イベント）の2つ。
//
// 読み直す先は claude 自身が書いた transcript（正典）で、tsukumo 側にキャッシュも
// スナップショットも作らない。ここを通るのは会話の内容そのものなので、ログにもファイルにも
// 出さない（docs/coding-standards.md「会話内容の扱い」）。
//
// セッションの印（`sessionTag` / `readSessionMark`）の組み立てと読み取りもここに置く
// （目印を扱う持ち主。環境変数ではないが、外の世界（claude の transcript）に書かれる値
// なので、組み立てと読み取りを1箇所に集める。以前は `core/config.ts` にあった）。

import { isPlainObject } from "remeda"

import { type Expression } from "../../../shared/expression.ts"
import { MAX_SESSION_CHOICES, type SessionChoice } from "../../../shared/session-choice.ts"
import { type SessionEvent } from "../../../shared/session-event.ts"
import { type Config } from "../../core/config.ts"
import { createReportReview } from "../../report/core/report-review.ts"
import { DEFAULT_VIEW_PORT, MAX_PORT_NUMBER } from "../../view-server/core/port-resolution.ts"
import { toSessionEvents } from "./sdk-message.ts"

/** セッションの印の前置き。組み立ては {@link sessionTag} だけ（文字列を他所で作らない）。 */
const SESSION_TAG_PREFIX = "tsukumo"
/** 雑談のセッションの印に足す後置き。仕事のときは足さない（{@link sessionTag}）。 */
const SESSION_TAG_CHAT_SUFFIX = "chat"
/**
 * 目印の区切り。`:` を使わないのは、後置きの `chat` と読み違えないため
 * （`tsukumo:<パック>:chat@7328` の最後の `@` から後ろが目印だと、区切りだけで分かる）。
 */
const SESSION_MARK_SEPARATOR = "@"
/**
 * 目印に使っていた文字（`A` / `B` / …）。読むときだけ使う（かつてはビューのポートの
 * 並び順を1文字に畳んでいた）。`A` が {@link DEFAULT_VIEW_PORT}、+1 ごとに次の文字だったので、
 * 同じ式で元のポートへ戻せる（{@link readSessionMark}）。組み立てはもう文字を使わない。
 */
const LEGACY_SESSION_MARK_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
/** ポート番号として読める目印の形（`@0`〜`@65535`）。 */
const SESSION_MARK_PORT = /^[0-9]{1,5}$/

/**
 * キャラクターパック1つぶんの、そのモードのセッションの印（SDK の `tagSession`）。続きから
 * 始めるセッションを選ぶ鍵の片方で、もう片方は起動した作業ディレクトリ
 * （docs/requirements.md 4.8「鍵」）。
 *
 * 印にパックの名前を混ぜるのは、キャラクターごとに別のセッションを持つため
 * （docs/design.md 7章）。印の無いセッション（同じディレクトリで使った素の `claude`）も、
 * 別のパックのセッションも、これで外れる。
 *
 * 雑談のときだけ `:chat` を足すのは、雑談と仕事で claude 側の文脈ごと分けるため
 * （docs/chat-mode.md 4.9）。
 *
 * 末尾の目印（`@7327` / `@7328` …）は、同じディレクトリで tsukumo を何個も起こしたときに
 * 別々のセッションを持たせるためのもの（docs/requirements.md 4.8「鍵」）。目印はビューが
 * 実際に待ち受けているポートの番号そのもので、畳まない——セッションを指す ID が
 * 「キャラクターパック × ポート番号」だから。
 *
 * ポートを使うのは、「その目印がいま使われているか」を知っているものが他に無いため。印は
 * transcript に残るだけなので、落ちた tsukumo の印と動いている tsukumo の印は見分けられない
 * （実測。docs/requirements.md 4.8「鍵」）。ポートは OS が握っていて、既定の
 * ときは塞がっていれば +1 へずれ（`port-resolution.ts`）、プロセスが落ちれば空くので、
 * 起こし直せば同じ番号＝同じセッションへ戻る。
 *
 * 昔の印（目印の無いもの・1文字の `@A`）も同じセッションを指す（{@link readSessionMark} が
 * ポートへ戻す）ので、いま続いている仕事のセッションは今までどおり見つかる。
 *
 * 印は会話の内容ではないので、claude 自身の transcript に付けても「会話内容の扱い」には
 * 触れない。
 */
export function sessionTag(characterName: string, chat: boolean, viewPort: number): string {
  return `${sessionTagFamily(characterName, chat)}${SESSION_MARK_SEPARATOR}${String(viewPort)}`
}

/**
 * 目印を外した印（`tsukumo:<パック>` / `tsukumo:<パック>:chat`）。{@link sessionTag} が
 * 目印（ポート番号）を足すための下ごしらえで、外へは出さない——画面に出す切り替え先の一覧も
 * 続きから始めるセッションを選ぶのも、目印まで揃えた {@link sessionTag} の値で絞る。
 */
function sessionTagFamily(characterName: string, chat: boolean): string {
  const packTag = `${SESSION_TAG_PREFIX}:${characterName}`
  return chat ? `${packTag}:${SESSION_TAG_CHAT_SUFFIX}` : packTag
}

/** 印を読み解いた姿（{@link readSessionMark}）。 */
export type SessionMark = {
  /**
   * 目印（印を付けた tsukumo のビューのポート番号）。昔の印は既定のポートへ戻してある
   * （目印が無いもの＝`DEFAULT_VIEW_PORT`、1文字の `A` / `B` / …＝そこから並び順に +1）。
   */
  readonly viewPort: number
  /**
   * 目印まで揃えた印。続きから始めるセッションを選ぶときも、切り替え先の一覧をいまの部屋に
   * 絞るときも、これ同士を比べる（`tsukumo:<パック>` と `tsukumo:<パック>@A` と
   * `tsukumo:<パック>@7327` は同じセッションを指す）。
   */
  readonly tag: string
}

/**
 * transcript に付いていた印を読み解く。tsukumo の印でなければ undefined（同じディレクトリで
 * 使った素の `claude` のセッションはここで落ちる）。
 *
 * 読めた目印は必ずポート番号に戻し、印も `@<ポート>` の形へ揃えてから返すので、昔の印と
 * 今の印が同じセッションを指す:
 *
 * - `@7328` のような数字 → そのポート
 * - `@A` / `@B` … の1文字 → 並び順から戻したポート（`A` が `DEFAULT_VIEW_PORT`）
 * - それ以外（目印が無い・名前に `@` を含むパックの尻尾）→ `DEFAULT_VIEW_PORT`
 *
 * 最後の行のおかげで、`tsukumo:<パック>` は `tsukumo:<パック>@7327` と同じセッションを指す。
 */
export function readSessionMark(tag: string): SessionMark | undefined {
  if (!tag.startsWith(`${SESSION_TAG_PREFIX}:`)) {
    return undefined
  }

  const separator = tag.lastIndexOf(SESSION_MARK_SEPARATOR)
  const marked = separator === -1 ? undefined : markedViewPort(tag.slice(separator + 1))
  const family = marked === undefined ? tag : tag.slice(0, separator)
  const viewPort = marked ?? DEFAULT_VIEW_PORT
  return { viewPort, tag: `${family}${SESSION_MARK_SEPARATOR}${String(viewPort)}` }
}

/**
 * 印の末尾を目印として読む。目印として読めなければ undefined（パック名に `@` が入っている
 * ときの尻尾がここで落ちる）。
 */
function markedViewPort(mark: string): number | undefined {
  if (SESSION_MARK_PORT.test(mark)) {
    const port = Number(mark)
    return port <= MAX_PORT_NUMBER ? port : undefined
  }

  const legacyIndex = mark.length === 1 ? LEGACY_SESSION_MARK_LETTERS.indexOf(mark) : -1
  return legacyIndex === -1 ? undefined : DEFAULT_VIEW_PORT + legacyIndex
}

/**
 * 続きを探す起こし方かどうか（`docs/requirements.md` 4.8「逃げ道」）。`TSUKUMO_NEW_SESSION=1`
 * と fake driver は探さない——新規に起こすと決めているときに続きを探しても無駄で、
 * fake driver は claude を起こさないのでそもそも探す先が無い。
 *
 * `src/session-start.ts` の `listPackSessions` / `findPackSessionToResume` の両方が使う共通の
 * 判断（探さないときは一覧も空、続きも `{ kind: "new" }`）。
 */
export function canResume(config: Pick<Config, "newSession" | "driver">): boolean {
  return !config.newSession && config.driver !== "fake"
}

/**
 * 組み直した履歴のターンの終わり。transcript には `result`（ターンの終わり）が残らないので、
 * 終わり方は分からない。完了（`completed`）に倒すのは、失敗の印を出すより「終わったこと」を伝えるほうが
 * 画面の意味に合うため（進行中に見えると入力欄が中断ボタンのまま止まる）。
 */
const RESTORED_TURN_FINISHED: SessionEvent = {
  kind: "turn-finished",
  outcome: { kind: "completed" },
}

/** 組み直した再生の終わりの印（{@link toRestoredEvents}）。 */
const HISTORY_RESTORED: SessionEvent = { kind: "history-restored" }

/**
 * 続きから始めるセッションを選ぶ。印（`tagSession` で付けたもの）のあるもののうち、
 * `lastModified` が最新の1つ（docs/requirements.md 4.8「鍵」）。
 *
 * `cwd` での絞り込みは呼び出し側（`listSessions({ dir })`）が済ませている前提で、ここは印だけを見る。
 * 目印まで揃えてから比べるので（{@link readSessionMark}）、昔の印（目印の無いもの・
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
 * 切り替え先として選べるセッションを一覧にする（印そのものがセッションの一覧。別の保存先は
 * 作らない。docs/requirements.md 4.8「鍵」）。新しい順に並べ、tsukumo の印を持たないものと、
 * いまの部屋（渡した `tag`）と違う印のものは落とす。
 *
 * `cwd` での絞り込みは呼び出し側（`listSessions({ dir })`）が済ませている前提。渡す `tag` は
 * {@link selectSessionToResume} と同じ、目印まで揃えた印（{@link sessionTag}）——部屋は
 * ビューのポート1つにつき1つなので（`docs/glossary.md`「部屋」）、切り替え先も自分の部屋の
 * ものだけに絞る。目印まで揃えてから比べるので、昔の印（目印の無いもの・1文字の `@A`）も
 * 対応するポートの部屋の一覧に並ぶ。
 *
 * 一覧に並ぶのはいつも同じ部屋（同じ `tag`）のセッションなので、行が複数ある理由は
 * {@link sessionTag}。新しいほうを選ぶ手がかりは最終更新時刻（新しい順に並べる）。
 *
 * 返すのは新しいほうから {@link MAX_SESSION_CHOICES} 件まで（印は使うほど増え続ける）。
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
 * 組み直すため）。メッセージ1件の形は SDK のイベントとほぼ同じなので、変換の本体は
 * {@link toSessionEvents} に任せ、ここが足すのは transcript には残らない2つだけ:
 *
 * - 利用者の依頼（`request`）: `user` のテキストブロックから起こす（ツールの結果は除く）
 * - ターンの境目（`turn-finished`）: `result` が残らないので、次の依頼の手前と
 *   並びの末尾で区切る
 * - 再生の終わり（`history-restored`）: 末尾に1つ。transcript に残る時刻は読む口
 *   （`getSessionMessages`）が落とすので、ここまでの記録は時刻が分からないと畳み込みに伝える
 *
 * 差し戻された `report` の呼び出しも transcript には残るので、動いているときと同じく
 * `report` の差し戻し（`report-review.ts` の `pass`）に通して落とす。
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

  const closed = restored.turnOpen ? [...restored.events, RESTORED_TURN_FINISHED] : restored.events
  const review = createReportReview()
  const events = closed.flatMap((event) => review.pass(event))
  // 再生の終わりに印を1つ足す（`history-restored`）。transcript を読む口が時刻を落とすので、
  // ここまでの記録は起きた時刻が分からない（`docs/design.md` 4.2「記録の時刻」）。組み直せた
  // ものが無ければ、書き換える記録も無いので足さない。
  return events.length === 0 ? events : [...events, HISTORY_RESTORED]
}

/** 印の付いたセッション1件（目印まで揃えた印つき）。 */
type TaggedSession = SessionChoice & {
  /** 目印まで揃えた印。{@link SessionMark.tag} と同じ意味で使う（{@link readSessionMark}）。 */
  readonly tag: string
}

/**
 * 一覧を、印の付いたセッションの並びにする。tsukumo の印を持たないもの・形が壊れているものは
 * 落とす（同じ cwd の素の `claude` のセッションはここで消える）。一覧そのものが配列で
 * なければ空。
 */
function markedSessions(sessions: unknown): readonly TaggedSession[] {
  return Array.isArray(sessions) ? sessions.flatMap((session) => taggedSession(session)) : []
}

/**
 * 一覧の要素1つを、印の付いたセッションとして受け取る。読めないものは空の並びにして落とす。
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
 * SDK の `summary`（外来の値）を行の見出しへ畳む。文字列でない・空・空白だけなら
 * 無いものとして扱う（`SessionChoice.heading` のコメント）。
 */
function headingFrom(summary: unknown): string | undefined {
  return typeof summary === "string" && summary.trim() !== "" ? summary : undefined
}

/** 組み直しの途中の姿（今のターンが開いたままかどうかを持ち回る）。 */
type RestoredTurns = {
  readonly events: readonly SessionEvent[]
  readonly turnOpen: boolean
}

/** イベントを1件積む。依頼の手前で、開いたままのターンを閉じる。 */
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
  // 組み直した依頼に画像は付かない（tsukumo は控えをディスクに残さず、原寸の棚もメモリだけで
  // 起こし直すと空になるので、読み直せるのは文面だけ。控えも出ないので、押せる控えも無い。
  // `docs/requirements.md` 4.10）。
  return text === undefined
    ? toSessionEvents(message, expressions)
    : [{ kind: "request", text, images: [] }]
}

/**
 * `user` のメッセージから利用者の依頼の文面を取り出す。ツールの結果（`tool_result`）は
 * 依頼ではないので undefined を返し、呼び出し側が {@link toSessionEvents} 側の変換に回す。
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
 * `user` の生のテキストから依頼の文面を組み立てる。仕掛けが `user` の役で差し込んだ塊は
 * 先に落とす（{@link withoutInjectedBlocks}）。残りを {@link foldSlashCommand} で入力欄から
 * 打ったときの見え方に畳み、何も残らなければ依頼ではないので undefined にする。
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
 * `<command-args>` の3タグ。並びと `<command-message>` の有無は入り方によって違う）を、
 * 入力欄から打ったときと同じ `/<name> <args>` の1行に畳む。`<command-message>` は
 * `<command-name>` と同じ名前の重複なので落とす。
 *
 * メッセージ全体がこれらのタグだけで出来ているときだけ畳む（地の文の途中にたまたま
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
 * 利用者が入力欄に打った文面ではないので、組み直した依頼には出さない
 * （docs/requirements.md 4.8）。
 *
 * 生きているセッションでは `request` は入力欄からの送信でだけ起き（`session-manager.ts`）、
 * これらは一度も画面に出ない。transcript から組み直すときだけ `user` の役として同じ場所に
 * 並んでしまうので、ここで揃える。実測で出たのは背景のタスクの知らせ
 * （`<task-notification>`）・ローカルコマンドの断り書き（`<local-command-caveat>`）・
 * 別のエージェントからの伝言（`<agent-message>`）の3つだが、同じ性質のものを合わせて落とす。
 *
 * 塊の丸ごとだけを落とす（開きと閉じが揃っているもの）ので、利用者の文面に混じっていても
 * その前後は残る。
 */
function withoutInjectedBlocks(text: string): string {
  return text.replace(INJECTED_BLOCK, "").trim()
}

function nonEmpty(text: string): string | undefined {
  return text.trim() === "" ? undefined : text
}
