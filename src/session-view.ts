// 内部イベントの並びから、いま画面に出すべき中身を決める。原則2の「決める」層。
//
// **純粋な畳み込み**（状態と1件のイベントから次の状態を返す）にしてあるので、fs にも
// process にも SDK にも触らない。状態を持つのは呼び出し側（src/index.ts）。
//
// ここが決めるのは「何を出すか」までで、HTML の組み立ては src/view.ts の仕事。

import { type Expression, resolveExpression } from "./expression.ts"
import { type PendingAsk } from "./pending-answer.ts"
import { type Question } from "./question.ts"
import { type CommandDescription, type SessionEvent } from "./session-event.ts"
import { DEFAULT_SPEECH_MARKER, splitUtterance } from "./utterance.ts"

/**
 * サイドバーの「終わったもの」に残す、直近に使い終えたツールの数。並びは自前でスクロールするが、
 * 常駐プロセスがセッションを通して持ち続けるので無限には増やさない。
 */
const MAX_RECENT_FINISHED_TOOLS = 50

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
  /**
   * ツールが動き始めた時刻（呼び出し側が渡す現在時刻。`applySessionEvent` の `now`）。
   * 表情を「作業中」に切り替えるかどうかの判定（`resolveExpression`）にだけ使う。
   */
  readonly startedAt: number
}

/**
 * メインビューに時系列で流す1件分の記録。**利用者の依頼**（やり取りの境界）・ツールの実行・
 * 発話の詳細の3種類。**描く側（src/view.ts）が読むだけの形**で、ここが決めた結果を渡す
 * （{@link mainViewEntries}）。
 */
export type MainViewEntry =
  | { readonly kind: "request"; readonly text: string }
  // キャラクターからの質問（AskUserQuestion）。`answers` は選ばれた答えのラベル（未回答なら空）。
  | {
      readonly kind: "question"
      readonly questions: readonly Question[]
      readonly answers: readonly string[]
    }
  | {
      readonly kind: "tool"
      readonly name: string
      readonly input: unknown
      /** まだ結果が届いていない（作業中の）ツールは undefined になる。 */
      readonly result: { readonly content: string; readonly isError: boolean } | undefined
    }
  | { readonly kind: "detail"; readonly markdown: string }

/**
 * セッションの中で起きたことを起きた順に並べたもの。{@link MainViewEntry} とほぼ同じだが、
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
      readonly startedAt: number
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
   * 吹き出しに並べて出す、今のターンのセリフ（古い→新しいの順。**件数の上限は無い**、
   * ターンの境目だけで区切る）。**セリフが1つも来なかったターンでも消さない**
   * （docs/requirements.md 4.2。`request` の時点では前のターンの並びの**最後の1件だけ**を残し、
   * 次の `speech` が来た時点でそのターンのものだけに置き換わる。{@link applySessionEvent} の
   * `request` / `speech` を参照）。まだ一度も `speak` が呼ばれていなければ空配列。
   */
  readonly speeches: readonly string[]
  /** 直近のセリフに添えられた表情。ツールの実行中は「作業中」が優先される。 */
  readonly speechExpression: Expression
  /**
   * 今のターンで `speak` が呼ばれたか（マーカー行の補助で拾ったセリフを、置き換えるか
   * 並べるかの判定に使う。{@link settleUtterance}）。`request` で false に戻る。
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
   * （サイドバーの「いま何をしているか」の並びに、実行中の下へ積む）。
   */
  readonly finishedTools: readonly ToolActivity[]
  /** 答え待ちの列（許可プロンプトと質問）。 */
  readonly pending: readonly PendingAsk[]
  readonly sessionId: string | undefined
  readonly model: string | undefined
  readonly permissionMode: string | undefined
  /**
   * 入力欄の `/` 補完に出せるコマンド名（`init` のたびに上書きされる）。**端末専用
   * （`terminal_slash_commands`）は除いてある**（{@link commandCandidates}。
   * docs/requirements.md 4.2「入力欄」）。
   */
  readonly slashCommands: readonly string[]
  /**
   * SDK から届いたコマンドの説明（名前と説明の組）。**端末専用のものも混ざったままの生の一覧**
   * で、補完に出す並びは {@link commandSuggestions} が `slashCommands` と突き合わせて作る。
   * 説明がまだ届いていなければ空配列（そのときは名前だけの補完に戻る）。
   */
  readonly commandDescriptions: readonly CommandDescription[]
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
  commandDescriptions: [],
  endedReason: undefined,
  turnInProgress: false,
}

/**
 * イベント1件を畳み込んで次の姿を返す。知らない状況でも必ず姿を返す（落ちない）。
 *
 * `now` は `tool-started` の `startedAt` を記録するためだけに使う現在時刻。`Date.now()` を
 * ここで呼ばないのは、この関数を純粋関数のまま保つため（呼び出し側の src/index.ts が渡す）。
 */
export function applySessionEvent(
  view: SessionView,
  event: SessionEvent,
  now: number,
): SessionView {
  switch (event.kind) {
    case "session-info":
      return {
        ...view,
        sessionId: event.sessionId,
        model: event.model,
        permissionMode: event.permissionMode,
        slashCommands: commandCandidates(event.slashCommands, event.terminalSlashCommands),
      }
    case "command-descriptions":
      return { ...view, commandDescriptions: event.descriptions }
    case "request":
      return {
        ...view,
        records: trimToRecentTurns([...view.records, { kind: "request", text: event.text }]),
        // 前のターンの並びは最後の1件だけ残す（消すとキャラクターが消えたように見えるが、
        // 丸ごと持ち越すと次のターンの冒頭に前のターンの並びが残ってしまう）。
        speeches: view.speeches.slice(-1),
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
        speeches: [...(view.speechCalledInTurn ? view.speeches : []), event.text],
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
            startedAt: now,
            result: undefined,
          },
        ],
        runningTools: [
          {
            toolUseId: event.toolUseId,
            name: event.name,
            input: event.input,
            nested,
            startedAt: now,
          },
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
 * いま出す表情。決め方の正典は `resolveExpression`（src/expression.ts）。ここは
 * `SessionView` の該当する値（実行中のツール・直近の `speak` の表情）を渡すだけ。
 * `now` は経過時間の判定に要る現在時刻（呼び出し側が渡す。`Date.now()` はここでは呼ばない）。
 */
export function currentExpression(view: SessionView, now: number): Expression {
  return resolveExpression(view.runningTools, view.speechExpression, now)
}

/**
 * 入力欄の `/` 補完に出す候補（名前と、あれば説明）。**並びも件数も `slashCommands` のまま**で、
 * `commandDescriptions` は同じ名前のものを引き当てるためだけに使う（説明が届いていない・
 * 説明を持たないコマンドは `description` が undefined になり、名前だけで出る）。
 */
export function commandSuggestions(view: SessionView): readonly CommandDescription[] {
  const descriptions = new Map(
    view.commandDescriptions.map((command) => [command.name, command.description]),
  )
  return view.slashCommands.map((name) => ({ name, description: descriptions.get(name) }))
}

/**
 * 入力欄の `/` 補完に出せるコマンド名。`slashCommands` から端末専用
 * （`terminalSlashCommands`。`doctor` / `color` / `reload-plugins` など）を除く
 * （docs/requirements.md 4.2「入力欄」）。
 */
export function commandCandidates(
  slashCommands: readonly string[],
  terminalSlashCommands: readonly string[],
): readonly string[] {
  const terminalOnly = new Set(terminalSlashCommands)
  return slashCommands.filter((command) => !terminalOnly.has(command))
}

function isReportRecord(
  record: SessionRecord,
): record is Extract<SessionRecord, { readonly kind: "request" } | { readonly kind: "detail" }> {
  return record.kind !== "tool"
}

/**
 * 書きかけの本文を確定した記録に移す。空のときは何もしない（空の本文を積まない）。
 *
 * **行頭マーカーの補助をここで効かせる**（docs/requirements.md 4.2「行頭のマーカーは補助に
 * 格下げ」）。拾えたセリフは吹き出しへ、本文からはマーカー行を除く。`speak` が呼ばれたターンでも
 * 同じ（規約が守られずに本文へ紛れたセリフの受け皿。以前は本文をそのまま出していたが、締めの
 * 一言がメインビューに残った。2026-09-12）。
 */
function settleUtterance(view: SessionView): SessionView {
  if (view.partialUtterance.trim() === "") {
    return { ...view, partialUtterance: "" }
  }

  const settled = withMarkerFallback(view)
  const markdown = settled.partialUtterance

  return {
    ...settled,
    records:
      markdown.trim() === "" ? settled.records : [...settled.records, { kind: "detail", markdown }],
    partialUtterance: "",
  }
}

/**
 * 行頭マーカーの補助を1回効かせる。拾えたセリフは、そのターンに `speak` があればその後ろに
 * 並べ、無ければ**そのターン最初のセリフとして**置き換える（前のターンの並びと混ざらない。
 * `speech` イベントの扱いと同じ規約）。
 * `partialUtterance` にはマーカー行を除いた本文を残す（呼び出し側が確定した記録へ積む）。
 */
function withMarkerFallback(view: SessionView): SessionView {
  const parts = splitUtterance(view.partialUtterance, DEFAULT_SPEECH_MARKER)
  if (parts.speech === undefined) {
    return { ...view, partialUtterance: parts.detail }
  }

  // speak を呼んだターンでも、本文に紛れたマーカー行は吹き出しへ回す（規約が守られなかった
  // ときの受け皿。speak のあとに並べて、同じターンのまとまりとして出す）。
  const speeches = view.speechCalledInTurn ? [...view.speeches, parts.speech] : [parts.speech]

  return {
    ...view,
    speeches,
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
    startedAt: record.startedAt,
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
