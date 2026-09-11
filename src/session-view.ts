// 内部イベントの並びから、いま画面に出すべき中身を決める。原則2の「決める」層。
//
// **純粋な畳み込み**（状態と1件のイベントから次の状態を返す）にしてあるので、fs にも
// process にも SDK にも触らない。状態を持つのは呼び出し側（src/index.ts）。
//
// ここが決めるのは「何を出すか」までで、HTML の組み立ては src/view.ts の仕事。

import { type Expression } from "./expression.ts"
import { type PendingAsk } from "./pending-answer.ts"
import { type SessionEvent } from "./session-event.ts"
import { DEFAULT_SPEECH_MARKER, type MainViewEntry, splitUtterance } from "./transcript.ts"

/** サイドバーの「終わったもの」に残す、直近に使い終えたツールの数（縦に狭い領域なので絞る）。 */
const MAX_RECENT_FINISHED_TOOLS = 5

/**
 * 吹き出しに並べて出す、同じターン内の直近セリフの上限件数（docs/requirements.md 4.2
 * 「続けて並べた行は1つのまとまり」）。**ターンをまたいだセリフは混ぜない**
 * （{@link applySessionEvent} の `speech` の扱いを参照）。
 */
const MAX_RECENT_SPEECHES = 3

/**
 * メインビューに残す記録の窓（直近何ターンぶんを持ち続けるか）。**過去のやり取りは
 * `buildMainBody` 側のタブ（`MAX_MAIN_VIEW_TURNS`）でさらに絞られる**が、常駐プロセスが
 * セッションを通して動き続ける以上、ここで持つ記録自体も無限に増やさない。
 */
const MAX_SESSION_VIEW_TURNS = 20

/**
 * サイドバーの「いま何をしているか」1件分。**引数はここまで持ち込む**（要約は表示側
 * `src/view.ts` の `summarizeToolInput` の仕事。`docs/coding-standards.md`「会話内容の扱い」の
 * とおり、要約に断片が入りうることは呼び出し側が承知した上で使う）。
 */
export type ToolActivity = {
  readonly toolUseId: string
  readonly name: string
  readonly input: unknown
  /** サブエージェントの中で動いたか（`tool-started` の `parentToolUseId` があるか）。 */
  readonly nested: boolean
}

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
      readonly nested: boolean
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
   * 吹き出しに並べて出す、直近のセリフ（古い→新しいの順、最大 {@link MAX_RECENT_SPEECHES} 件）。
   * **セリフが1つも来なかったターンでも消さない**（docs/requirements.md 4.2。新しいターンが
   * 始まっても、次の `speech` が来るまでは前のターンの並びをそのまま保つ）。
   * **次の `speech` が来た時点で、そのターンのものだけに置き換わる**（前のターンの分と混ざらない。
   * {@link applySessionEvent} の `speech` を参照）。まだ一度も `speak` が呼ばれていなければ空配列。
   */
  readonly speeches: readonly string[]
  /** 直近のセリフに添えられた表情。ツールの実行中は「作業中」が優先される。 */
  readonly speechExpression: Expression
  /**
   * 今のターンで `speak` が呼ばれたか（マーカー行の補助を効かせるかどうかの判定に使う。
   * {@link settleUtterance}）。`request` で false に戻る。
   */
  readonly speechCalledInTurn: boolean
  /** 確定した記録。書きかけの本文は含まない。 */
  readonly records: readonly SessionRecord[]
  /** 書きかけの本文。完成した本文が来たら空に戻る。 */
  readonly partialUtterance: string
  /** 実行中のツール（`tool_use` は届いたが結果がまだ来ていないもの）。新しい順。 */
  readonly runningTools: readonly ToolActivity[]
  /**
   * 直近に使い終えたツール。新しい順、最大 {@link MAX_RECENT_FINISHED_TOOLS} 件
   * （サイドバーの「終わったものは薄く数行」）。
   */
  readonly finishedTools: readonly ToolActivity[]
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
  speeches: [],
  speechExpression: "default",
  speechCalledInTurn: false,
  records: [],
  partialUtterance: "",
  runningTools: [],
  finishedTools: [],
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
        records: trimToRecentTurns([...view.records, { kind: "request", text: event.text }]),
        partialUtterance: "",
        turnInProgress: true,
        speechCalledInTurn: false,
      }
    case "partial-utterance":
      return { ...view, partialUtterance: view.partialUtterance + event.text }
    case "utterance":
      return settleUtterance({ ...view, partialUtterance: event.text })
    case "speech":
      return {
        ...view,
        // 前のターンのセリフが残っているなら、ここで捨てて今のターンだけの並びにする
        // （docs/requirements.md 4.2「次の speak が来た時点でそのターンのものだけになる」）。
        speeches: [...(view.speechCalledInTurn ? view.speeches : []), event.text].slice(
          -MAX_RECENT_SPEECHES,
        ),
        speechExpression: event.expression,
        speechCalledInTurn: true,
      }
    case "tool-started": {
      const nested = event.parentToolUseId !== undefined
      return {
        ...view,
        records: [
          ...view.records,
          {
            kind: "tool",
            toolUseId: event.toolUseId,
            name: event.name,
            input: event.input,
            nested,
            result: undefined,
          },
        ],
        runningTools: [
          { toolUseId: event.toolUseId, name: event.name, input: event.input, nested },
          ...view.runningTools,
        ],
      }
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
        runningTools: [],
        turnInProgress: false,
      }
  }
}

/**
 * メインビューに渡す記録。**書きかけの本文を末尾に足す**ので、`buildMainBody` はそのまま
 * リアルタイムの表示になる（完成した本文が来た時点で確定した記録の側へ移る）。
 *
 * **メインビューはレポートだけ**（docs/requirements.md 4.2「ツールの流れはサイドバーへ」）。
 * `records` に積んだ `tool` の記録はここでは渡さない（サイドバーの仕事は `runningTools` /
 * `finishedTools` を直接読む src/index.ts の役目）。
 */
export function mainViewEntries(view: SessionView): readonly MainViewEntry[] {
  const settled = view.records.filter(isReportRecord)
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
  return view.runningTools.length > 0 ? "working" : view.speechExpression
}

function isReportRecord(
  record: SessionRecord,
): record is Extract<SessionRecord, { readonly kind: "request" } | { readonly kind: "detail" }> {
  return record.kind !== "tool"
}

/**
 * 書きかけの本文を確定した記録に移す。空のときは何もしない（空の本文を積まない）。
 *
 * **`speak` が1回もこのターンで呼ばれていなければ、行頭マーカーの補助を効かせる**
 * （docs/requirements.md 4.2「行頭のマーカーは補助に格下げ」）。拾えたセリフは吹き出しへ、
 * 本文からはマーカー行を除く。**`speak` が呼ばれたターンでは本文をそのまま出す**
 * （マーカー行があっても除かない。すでにセリフは `speak` の引数から出ているため）。
 */
function settleUtterance(view: SessionView): SessionView {
  if (view.partialUtterance.trim() === "") {
    return { ...view, partialUtterance: "" }
  }

  const settled = view.speechCalledInTurn ? view : withMarkerFallback(view)
  const markdown = settled.partialUtterance

  return {
    ...settled,
    records:
      markdown.trim() === "" ? settled.records : [...settled.records, { kind: "detail", markdown }],
    partialUtterance: "",
  }
}

/**
 * 行頭マーカーの補助を1回効かせる。拾えたセリフがあれば、**そのターン最初のセリフとして**
 * 置き換える（前のターンの並びと混ざらない。`speech` イベントの扱いと同じ規約）。
 * `partialUtterance` にはマーカー行を除いた本文を残す（呼び出し側が確定した記録へ積む）。
 */
function withMarkerFallback(view: SessionView): SessionView {
  const parts = splitUtterance(view.partialUtterance, DEFAULT_SPEECH_MARKER)
  if (parts.speech === undefined) {
    return { ...view, partialUtterance: parts.detail }
  }

  return {
    ...view,
    speeches: [parts.speech],
    speechCalledInTurn: true,
    partialUtterance: parts.detail,
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

  const activity: ToolActivity = {
    toolUseId: record.toolUseId,
    name: record.name,
    input: record.input,
    nested: record.nested,
  }

  return {
    ...view,
    records: [
      ...view.records.slice(0, index),
      { ...record, result: { content, isError } },
      ...view.records.slice(index + 1),
    ],
    runningTools: view.runningTools.filter((running) => running.toolUseId !== toolUseId),
    finishedTools: [activity, ...view.finishedTools].slice(0, MAX_RECENT_FINISHED_TOOLS),
  }
}

/**
 * 直近 {@link MAX_SESSION_VIEW_TURNS} ターンぶんだけを残す。**ターンの境目は `request`**
 * なので、古い `request` から数えて窓の外に出たものをまとめて落とす。
 */
function trimToRecentTurns(records: readonly SessionRecord[]): readonly SessionRecord[] {
  const requestIndexes = records.reduce<readonly number[]>(
    (indexes, record, index) => (record.kind === "request" ? [...indexes, index] : indexes),
    [],
  )
  if (requestIndexes.length <= MAX_SESSION_VIEW_TURNS) {
    return records
  }

  const cutAt = requestIndexes[requestIndexes.length - MAX_SESSION_VIEW_TURNS]
  return cutAt === undefined ? records : records.slice(cutAt)
}
