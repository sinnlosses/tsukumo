// 内部イベントの並びから、いま画面に出すべき中身を決める。原則2の「決める」層。
//
// **純粋な畳み込み**（状態と1件のイベントから次の状態を返す）にしてあるので、fs にも
// process にも SDK にも触らない。状態を持つのは呼び出し側（src/index.ts）。
//
// ここが決めるのは「何を出すか」までで、HTML の組み立ては src/view.ts の仕事。

import { type Expression } from "./expression.ts"
import { type PendingAsk } from "./pending-answer.ts"
import { type SessionEvent } from "./session-event.ts"
import { type MainViewEntry } from "./transcript.ts"

/** サイドバーに出す、直近に使ったツールの数（縦に狭い領域なので絞る）。 */
const MAX_RECENT_TOOL_NAMES = 5

/**
 * セッションの中で起きたことを起きた順に並べたもの。メインビューの `MainViewEntry` とほぼ同じだが、
 * **ツールは `toolUseId` を持つ**（あとから届く結果を突き合わせるため。表示には使わない）。
 */
export type SessionRecord =
  | { readonly kind: "request"; readonly text: string }
  | { readonly kind: "detail"; readonly markdown: string }
  | {
      readonly kind: "tool"
      readonly toolUseId: string
      readonly name: string
      readonly input: unknown
      readonly result: { readonly content: string; readonly isError: boolean } | undefined
    }

/**
 * セッションの今の姿。**イベントを1件ずつ畳んで作る**ので、ここに無い情報は画面にも出ない。
 *
 * `partialUtterance` は書きかけの本文で、完成した本文（`utterance`）が来たら空に戻る。
 * こうしておくと、断片と完成メッセージの**両方が届いても二重に積まれない**
 * （docs/requirements.md 4.2「書きかけの本文がそのまま流れていき、ターンが終わった瞬間に
 * 整形し直す」）。
 */
export type SessionView = {
  /**
   * 吹き出しに出す直近のセリフ。**セリフが1つも来なかったターンでも消さない**
   * （docs/requirements.md 4.2）。まだ一度も `speak` が呼ばれていないときだけ undefined。
   */
  readonly speech: string | undefined
  /** 直近のセリフに添えられた表情。ツールの実行中は「作業中」が優先される。 */
  readonly speechExpression: Expression
  /** 確定した記録。書きかけの本文は含まない。 */
  readonly records: readonly SessionRecord[]
  /** 書きかけの本文。完成した本文が来たら空に戻る。 */
  readonly partialUtterance: string
  /** 実行中のツール（`tool_use` は届いたが結果がまだ来ていないもの）。新しい順。 */
  readonly runningToolNames: readonly string[]
  /** 直近に使い終えたツールの名前。新しい順。 */
  readonly finishedToolNames: readonly string[]
  /** 答え待ちの列（許可プロンプトと質問）。 */
  readonly pending: readonly PendingAsk[]
  readonly sessionId: string | undefined
  readonly model: string | undefined
  readonly permissionMode: string | undefined
  /** 入力欄の `/` 補完に使うスラッシュコマンド（`init` のたびに上書きされる）。 */
  readonly slashCommands: readonly string[]
  /** セッションが終わった理由。動いている間は undefined。 */
  readonly endedReason: string | undefined
  /**
   * ターンが進行中か。`request` で始まり、`turn-finished` / `session-ended` で終わる
   * （入力欄が送信と中断を切り替える判断材料。docs/requirements.md 4.7）。
   */
  readonly turnInProgress: boolean
}

export const INITIAL_SESSION_VIEW: SessionView = {
  speech: undefined,
  speechExpression: "default",
  records: [],
  partialUtterance: "",
  runningToolNames: [],
  finishedToolNames: [],
  pending: [],
  sessionId: undefined,
  model: undefined,
  permissionMode: undefined,
  slashCommands: [],
  endedReason: undefined,
  turnInProgress: false,
}

/** イベント1件を畳み込んで次の姿を返す。知らない状況でも必ず姿を返す（落ちない）。 */
export function applySessionEvent(view: SessionView, event: SessionEvent): SessionView {
  switch (event.kind) {
    case "session-info":
      return {
        ...view,
        sessionId: event.sessionId,
        model: event.model,
        permissionMode: event.permissionMode,
        slashCommands: event.slashCommands,
      }
    case "request":
      return {
        ...view,
        records: [...view.records, { kind: "request", text: event.text }],
        partialUtterance: "",
        turnInProgress: true,
      }
    case "partial-utterance":
      return { ...view, partialUtterance: view.partialUtterance + event.text }
    case "utterance":
      return settleUtterance({ ...view, partialUtterance: event.text })
    case "speech":
      return { ...view, speech: event.text, speechExpression: event.expression }
    case "tool-started":
      return {
        ...view,
        records: [
          ...view.records,
          {
            kind: "tool",
            toolUseId: event.toolUseId,
            name: event.name,
            input: event.input,
            result: undefined,
          },
        ],
        runningToolNames: [event.name, ...view.runningToolNames],
      }
    case "tool-finished":
      return finishTool(view, event.toolUseId, event.content, event.isError)
    case "pending-changed":
      return { ...view, pending: event.pending }
    // 書きかけのまま終わったターン（中断など）の本文を捨てず、確定した記録に移す。
    case "turn-finished":
      return { ...settleUtterance(view), turnInProgress: false }
    case "session-ended":
      return {
        ...settleUtterance(view),
        endedReason: event.reason,
        runningToolNames: [],
        turnInProgress: false,
      }
  }
}

/**
 * メインビューに渡す記録。**書きかけの本文を末尾に足す**ので、`buildMainBody` はそのまま
 * リアルタイムの表示になる（完成した本文が来た時点で確定した記録の側へ移る）。
 */
export function mainViewEntries(view: SessionView): readonly MainViewEntry[] {
  const settled = view.records.map((record) => toMainViewEntry(record))
  return view.partialUtterance === ""
    ? settled
    : [...settled, { kind: "detail", markdown: view.partialUtterance }]
}

/**
 * いま出す表情。**ツールを実行している間は「作業中」**（docs/requirements.md 4.3）で、
 * それ以外は直近の `speak` が指定した表情。状態として持たずここで決めるのは、
 * ツールの開始と終了だけで自然に戻るようにするため。
 */
export function currentExpression(view: SessionView): Expression {
  return view.runningToolNames.length > 0 ? "working" : view.speechExpression
}

/**
 * サイドバーの「いま何をしているか」に出すツール名。**実行中のものが先**で、
 * そのあとに使い終えたものを新しい順に並べる。引数と結果は出さない
 * （docs/coding-standards.md「会話内容の扱い」）。
 */
export function recentToolNames(view: SessionView): readonly string[] {
  return [...view.runningToolNames, ...view.finishedToolNames].slice(0, MAX_RECENT_TOOL_NAMES)
}

function toMainViewEntry(record: SessionRecord): MainViewEntry {
  if (record.kind === "tool") {
    return { kind: "tool", name: record.name, input: record.input, result: record.result }
  }

  return record
}

/** 書きかけの本文を確定した記録に移す。空のときは何もしない（空の本文を積まない）。 */
function settleUtterance(view: SessionView): SessionView {
  if (view.partialUtterance.trim() === "") {
    return { ...view, partialUtterance: "" }
  }

  return {
    ...view,
    records: [...view.records, { kind: "detail", markdown: view.partialUtterance }],
    partialUtterance: "",
  }
}

/**
 * ツール1件の結果を記録に合わせる。**対応する `tool_use` が見つからないときは何もしない**
 * （対応が取れない結果を作らない）。
 */
function finishTool(
  view: SessionView,
  toolUseId: string,
  content: string,
  isError: boolean,
): SessionView {
  const index = view.records.findIndex(
    (record) => record.kind === "tool" && record.toolUseId === toolUseId,
  )
  const record = index === -1 ? undefined : view.records[index]
  if (record === undefined || record.kind !== "tool") {
    return view
  }

  return {
    ...view,
    records: [
      ...view.records.slice(0, index),
      { ...record, result: { content, isError } },
      ...view.records.slice(index + 1),
    ],
    runningToolNames: removeFirst(view.runningToolNames, record.name),
    finishedToolNames: [record.name, ...view.finishedToolNames].slice(0, MAX_RECENT_TOOL_NAMES),
  }
}

function removeFirst(names: readonly string[], name: string): readonly string[] {
  const index = names.indexOf(name)
  return index === -1 ? names : [...names.slice(0, index), ...names.slice(index + 1)]
}
