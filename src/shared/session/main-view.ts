// メインビューに出す形（`MainViewEntry`）と、それをやり取り（ターン）ごとにまとめる判断。
// セッションの姿から導くだけで、状態は持たない。

import { sum } from "remeda"

import { reportChecksMarkdown } from "../report/report-check.ts"
import { reportSectionsMarkdown, SECTIONS_START_MARKDOWN } from "../report/report-markdown.ts"
import { NO_REPORT_TASK, type ReportTask } from "../report/report-task.ts"
import { tidyReportSections } from "../report/report-tidy.ts"
import type { RecordedPromptImage } from "../session-driver/prompt-image.ts"
import type { Question, QuestionAnswer } from "../session-driver/question.ts"
import type { TurnFailure } from "../session-driver/turn-failure.ts"
import { isBlankText } from "../utils/blank-text.ts"
import {
  MAX_SESSION_STATE_TURNS,
  type SessionRecord,
  type SessionState,
  type ToolRunStatus,
  type TurnBodies,
} from "./session-state.ts"
import {
  advanceTurnContext,
  bashCommandDuration,
  EMPTY_TURN_CONTEXT,
  lastBashOf,
  latestWorkPlanOf,
  type TurnContext,
} from "./turn-context.ts"
import { splitIntoTurns, type TurnRest, turnIdOf } from "./turn.ts"
import { type LatestWorkPlan, type PhaseShift, phaseShiftOf } from "./work-plan.ts"

/**
 * 出すやり取りの数。
 * 値は {@link MAX_SESSION_STATE_TURNS}.work から導く（メインビューの窓が記録の窓を超えない関係を導出で保つ。別々の定数にすると、どちらかだけを直したときに関係が黙って崩れる）。
 */
export const MAX_MAIN_VIEW_TURNS = MAX_SESSION_STATE_TURNS.work

/**
 * 1つのやり取りの中で画面に出す記録の上限。超えた分は古いほうから落とし、件数だけを残す（やり取りの境界を優先する）。
 *
 * 数えるのは実際に画面へ出るもの（レポート・段の知らせ・質問の記録）だけ（{@link shownEntryCount}）。
 * 画面に出るものだけを数えると1つのやり取りの最大は6件（中位数1・p99で4件。実測）で、この値には当たらない。
 * 落とすための値ではなく、1つのやり取りが際限なく伸びたときの止め。
 */
const MAX_MAIN_VIEW_ENTRIES = 40

/**
 * メインビューに時系列で流す1件分の記録。
 * 描く側が読むだけの形で、ここが決めた結果を渡す（{@link mainViewEntries}）。
 */
export type MainViewEntry =
  | {
      readonly kind: "request"
      /** そのターンの通し番号（`SessionState.nextTurnId` が振ったもの）。 */
      readonly turnId: number
      readonly text: string
      readonly images: readonly RecordedPromptImage[]
    }
  /**
   * キャラクターからの質問（AskUserQuestion）と、それに対する答え。`answers[i]` は
   * `questions[i]` に対して選んだ答えの並び（{@link QuestionAnswer}。選ばなかった質問は空）。
   */
  | {
      readonly kind: "question"
      readonly questions: readonly Question[]
      readonly answers: readonly QuestionAnswer[]
    }
  | {
      readonly kind: "tool"
      readonly name: string
      readonly input: unknown
      readonly status: ToolRunStatus
    }
  | { readonly kind: "detail"; readonly markdown: string }
  /**
   * `report` ツールで受け取ったレポート。引数はここで1つの本文に組んである（{@link reportMarkdown}）。
   * `detail` と分けてあるのは、このレポートがあるやり取りでは本文（`detail`）を出さないため（{@link selectToolReports}）。
   * `task` は本文に組まず、描く側が目録の1行と見出しに出す。
   * `conclusion` は組む前の結論で、畳んだときの先頭行に使う（{@link groupIntoSteps}）。
   */
  | {
      readonly kind: "report"
      readonly markdown: string
      readonly conclusion: string
      readonly task: ReportTask
    }
  /**
   * `work_plan` の呼び出しで段が移ったこと（{@link phaseShiftOf}）。出すものが1つも無い呼び出しからは作らない。
   * 終えた段のまとめは中間レポートに、入った段は段の知らせになる（{@link groupIntoSteps}）。
   */
  | { readonly kind: "phase-shift"; readonly shift: PhaseShift }
  /**
   * 失敗で終わったターンの理由（`SessionRecord` の `turn-failure` をそのまま通す）。
   * ステップには入れない（やり取りの末尾に1つだけ出す印なので、{@link groupIntoTurns} がステップから外して `MainViewTurn.failure` に移す）。
   */
  | { readonly kind: "turn-failure"; readonly failure: TurnFailure }

export type MainViewToolRun = Extract<MainViewEntry, { readonly kind: "tool" }>
export type MainViewQuestion = Extract<MainViewEntry, { readonly kind: "question" }>

/** ステップの中で起きたこと。ツールの実行か、キャラクターからの質問。 */
export type MainViewAction = MainViewToolRun | MainViewQuestion

/**
 * やり取りが失敗で終わったか（`MainViewTurn.failure`）。`failed` のときだけ、描く側がやり取りの末尾に「失敗で終わった」と理由を出す。
 * 1つのやり取りに失敗が2つ以上あれば（背景のタスクのあとの続きのターンも失敗したときなど）、いちばん新しいものを出す。
 */
export type MainViewTurnFailure =
  | { readonly kind: "none" }
  | { readonly kind: "failed"; readonly failure: TurnFailure }

/**
 * 1ステップ＝レポート1件と、それに続く出来事。
 *
 * `body` は画面に出す本文（{@link MainViewStepBody}）。
 *
 * `interim` は、その本文が中間レポート（`report` ツールの最後でない呼び出し〔{@link selectToolReports}〕か、段のまとめ〔{@link groupIntoSteps}〕）かどうか。`body` が `none` のときは常に false。
 *
 * `superseded` は、自分より後ろに本文を持つステップがあるか（{@link markSupersededSteps}）。
 * `interim && superseded` のときだけ描く側が畳む。本文を持たないステップでも立つ。
 *
 * `final` は、その本文が最終レポート（そのやり取りで最後の、中間でない本文）かどうか（{@link markFinalReport}）。
 * ラベルを載せる印（`.main-step.is-final`）で、書き上げる演出を掛ける相手を選ぶのにも使う。
 * ラベルを出すかどうかはこれだけでは決まらない（`MainViewTurn.hasInterimReport` と本文の `task` と組み合わせる）。
 * いちばん新しいやり取りでは、やり取りが閉じているときだけ立つ（{@link mainViewTurns} の `closed` 引数）。
 *
 * `id` は、そのやり取りの中で作られた順に先頭から数えた通し番号。
 * {@link limitTurnEntries} が上限を超えた分を古いほうから落としても、残ったステップの `id` は変わらない（{@link groupIntoSteps} で、落とす前に振る）。
 * 描く側はこれをステップの `key` に使う。
 * 配列の添字を `key` にすると、古いステップが落ちて添字が前へずれた瞬間に、React が別のステップの DOM を使い回す（`<details>` の `open` のような制御されていない DOM の状態が別のステップへ乗り移って見える）。
 *
 * `phaseNotice` は、本文の後ろに出す段の知らせ（入った段の見出しの字）。段が移った `work_plan` から作ったステップだけが持つ。
 */
export type MainViewStep = {
  readonly id: number
  readonly body: MainViewStepBody
  readonly interim: boolean
  readonly superseded: boolean
  readonly final: boolean
  readonly phaseNotice: MainViewPhaseLabel
  readonly actions: readonly MainViewAction[]
}

/** 段の見出しの字（「2/4 段の名前」）。無ければ `none`。 */
export type MainViewPhaseLabel =
  | { readonly kind: "none" }
  | { readonly kind: "phase"; readonly label: string }

const NO_PHASE_LABEL = { kind: "none" } as const satisfies MainViewPhaseLabel

/**
 * ステップの本文。本文が無い（レポートより前に起きたことをまとめたステップか、出さないと決めた本文）なら `none`。
 * `firstLine` は畳んだときの `<summary>` に出す1行で、段のまとめなら終えた段の見出し、`task` があれば結論（空なら作業の名前）、どちらも無ければ本文の先頭行（{@link extractFirstLine}）。
 * `task` は目録の1行と見出しに出すタスクで、`report` ツールの外の本文では常に `none`。
 * `finishedPhase` は目録の1行に添える終えた段の見出しで、段のまとめだけが持つ。
 */
export type MainViewStepBody =
  | { readonly kind: "none" }
  | {
      readonly kind: "text"
      readonly report: string
      readonly firstLine: string
      readonly task: ReportTask
      readonly finishedPhase: MainViewPhaseLabel
    }

const NO_BODY = { kind: "none" } as const satisfies MainViewStepBody

/** やり取りの頭に出す依頼。文面と、添えた画像の控えで1つ。添えていなければ `images` は空。 */
export type MainViewRequest = {
  readonly text: string
  readonly images: readonly RecordedPromptImage[]
}

/**
 * 利用者の依頼1件と、それ以降のステップ。
 * `request` が undefined なのは、最初の依頼より前の記録（セッションの途中から追い始めたときに起こる）。
 * `id` は追加されても番号がずれないように先頭から数えた通し番号で、タブの選択を保つのに使う。
 */
export type MainViewTurn = {
  readonly id: number
  readonly request: MainViewRequest | undefined
  readonly steps: readonly MainViewStep[]
  /**
   * このやり取りに中間レポートが1つ以上あるか（{@link markFinalReport}）。
   * 最終レポートのラベルを出す条件の1つ（もう1つは本文の `task`）。本文が1つしか無く `task` も無いやり取りでは「最終」が何も区別しないので出さない。
   */
  readonly hasInterimReport: boolean
  /** 上限を超えて落とした画面に出す記録の件数。0 のときは何も落としていない。 */
  readonly droppedCount: number
  /** このやり取りが失敗で終わったか（{@link MainViewTurnFailure}）。 */
  readonly failure: MainViewTurnFailure
}

/**
 * メインビューに渡す記録。
 * 書きかけの本文を末尾に足すので、描く部品はそのままリアルタイムの表示になる（完成した本文が来た時点で確定した記録の側へ移る）。
 * `tool` の記録も渡す（ステップの `actions` に入る）が、描く側はそこから描かない。
 */
export function mainViewEntries(state: SessionState): readonly MainViewEntry[] {
  const settled: MainViewEntry[] = []
  let context: TurnContext = EMPTY_TURN_CONTEXT
  for (const record of state.records) {
    settled.push(...entriesOf(record, context))
    context = advanceTurnContext(context, record)
  }
  return isBlankText(state.partialUtterance)
    ? settled
    : [...settled, { kind: "detail", markdown: state.partialUtterance }]
}

/**
 * 時系列の記録を、やり取り（ターン）ごとにまとめ、直近 {@link MAX_MAIN_VIEW_TURNS} 件へ絞る。昇順（古い→新しい）で返す。
 *
 * `unsettled` はいちばん新しいやり取りで、まだ伸びうる本文の種類で、確定していない本文を出さないために要る（`report` を {@link selectToolReports} が、ツールの外の本文を {@link selectLastText} が見る）。
 * `SessionState.turn` が `running` かどうかそのものではない。
 * いま走っている SDK ターンで届いた本文だけが伸びうるもので、前の SDK ターンで届いた本文は、背景のタスクの通知などで claude が同じやり取りの続きを始めても確定したまま
 * （`report` の外の本文は例外で、続きが来うるあいだは伸びうる側に数える）。
 *
 * `closed` はセッション全体が閉じているか（ターンが `running` でなく、背景のタスクも残っていない）。
 * いちばん新しいやり取りにだけ渡す（それより前のやり取りは、次の依頼が始まった時点で既に閉じている）。
 * `unsettled` は「まだ伸びる本文をそもそも出すか」、`closed` は「出した本文に最終レポートの札を立ててよいか」で、独立に false になりうる
 * （背景の仕事を待って `turn-finished` が届くと `unsettled.report` は確定扱いに変わるが、背景のタスクが残っているあいだは `closed` は false のまま）。
 */
export function mainViewTurns(
  entries: readonly MainViewEntry[],
  unsettled: TurnBodies,
  closed: boolean,
): readonly MainViewTurn[] {
  const turns = groupIntoTurns(entries).slice(-MAX_MAIN_VIEW_TURNS)
  return turns
    .map(({ turn, toolReportIds }, index) => {
      // 動いているのはいちばん新しいやり取りだけで、それ以外の本文はもう確定している。
      const latest = index === turns.length - 1
      const selected =
        toolReportIds.length === 0
          ? selectLastText(turn, !latest || !unsettled.utterance)
          : selectToolReports(turn, toolReportIds, !latest || !unsettled.report)
      return { turn: markSupersededSteps(selected), closed: !latest || closed }
    })
    .map(({ turn, closed: turnClosed }) => markFinalReport(turn, turnClosed))
    .map((turn) => limitTurnEntries(turn))
}

/** 記録1件の変換が頼る、前の記録から持ち回した値（記録の参照。無ければ `none`）。 */
type EntryDependency = SessionRecord | "none"

type RememberedEntries = {
  readonly dependencies: readonly EntryDependency[]
  readonly entries: readonly MainViewEntry[]
}

const ENTRIES_BY_RECORD = new WeakMap<SessionRecord, RememberedEntries>()

/** 記録1件の変換。記録も頼る値も変わっていなければ、前と同じ配列（同じ参照の要素）を返す。 */
function entriesOf(record: SessionRecord, context: TurnContext): readonly MainViewEntry[] {
  const dependencies = dependenciesOf(record, context)
  const remembered = ENTRIES_BY_RECORD.get(record)
  if (
    remembered !== undefined &&
    remembered.dependencies.length === dependencies.length &&
    remembered.dependencies.every((dependency, index) => dependency === dependencies[index])
  ) {
    return remembered.entries
  }
  const entries = toMainViewEntries(record, context)
  ENTRIES_BY_RECORD.set(record, { dependencies, entries })
  return entries
}

function dependenciesOf(record: SessionRecord, context: TurnContext): readonly EntryDependency[] {
  if (record.kind === "work-plan") {
    return [context.plan]
  }
  if (record.kind === "report") {
    return [context.plan, ...record.checks.map((check) => lastBashOf(context, check.command))]
  }
  return []
}

/**
 * `SessionRecord` 1件をメインビューに出す形へ変える（出さないものは空で返す）。
 *
 * `speech` は落とす（セリフは吹き出しだけに出し、レポートに混ぜない）。
 * ターンの通し番号は `request` の記録が持っているので、何を落としても番号はずれない。
 *
 * `compact-boundary` も落とす（圧縮の区切りは雑談のログだけに出す）。
 *
 * `work-plan` は、段が移ったときだけ `phase-shift` にする（段取りそのものはレポートの本文の中に組む。{@link reportMarkdown}）。
 *
 * `tool` は `toolUseId` / `nested`（突き合わせにしか使わない内部の付随情報）を落とす（メインビューの部品が見てよいのは名前・入力・結果だけ）。
 */
function toMainViewEntries(record: SessionRecord, context: TurnContext): readonly MainViewEntry[] {
  if (record.kind === "speech" || record.kind === "compact-boundary") {
    return []
  }
  if (record.kind === "work-plan") {
    const shift = phaseShiftOf(latestWorkPlanOf(context), record)
    return shift.finished.kind === "none" && shift.entered.kind === "none"
      ? []
      : [{ kind: "phase-shift", shift }]
  }
  // `request` は時刻（雑談のログだけが読む）を落として通す。仕事のメインビューには時刻を出さない。
  if (record.kind === "request") {
    return [{ kind: "request", turnId: record.turnId, text: record.text, images: record.images }]
  }
  if (record.kind === "report") {
    return [
      {
        kind: "report",
        markdown: reportMarkdown(record, context),
        conclusion: record.conclusion,
        task: record.task,
      },
    ]
  }
  // `detail` / `question` / `turn-failure` は `MainViewEntry` と同じ形なのでそのまま通す。
  if (record.kind !== "tool") {
    return [record]
  }
  return [{ kind: "tool", name: record.name, input: record.input, status: record.status }]
}

/**
 * `report` の引数を、`conclusion` →（段取り）→ `checks` → 節の始まりの印 → `sections` → `favor` の順に1つの本文へ組む。
 * 印は結論か検証結果があり、節も1つ以上あるときだけ置く。
 * 段取りは同じやり取りの中でその `report` より前に届いた最後のもの。
 * `checks` は検証結果の表（{@link reportChecksMarkdown}。所要時間は同じやり取りの中の `tool` の記録から引く）、`favor` はレポートの記法の「お願い」の塊で包むので、サニタイズも記法の解釈もテキストの本文と同じ経路を通る。
 * `favor` は HTML の中に Markdown を入れるので、塊の内側の前後に空行を空ける。
 * 空の `checks` / `sections` / `favor` は塊ごと置かない。
 * `task` のあるレポートの `conclusion` は見出しの下の一文として描くので、`conclusion` の印で包む（`task` そのものは本文に組まない）。
 *
 * 節の並びはここで整形する（{@link tidyReportSections}。記録は引数のまま持ち、描くたびに導く）。
 */
function reportMarkdown(
  report: Extract<SessionRecord, { readonly kind: "report" }>,
  context: TurnContext,
): string {
  const head = [
    report.task.kind === "task" && !isBlankText(report.conclusion)
      ? `<div class="conclusion">\n\n${report.conclusion}\n\n</div>`
      : report.conclusion,
    statusMarkdown(
      workPlanMarkdown(latestWorkPlanOf(context)),
      reportChecksMarkdown(report.checks, (command) => bashCommandDuration(context, command)),
    ),
  ].filter((part) => !isBlankText(part))
  const sections = reportSectionsMarkdown(tidyReportSections(report), {
    kind: "shelved",
    toolUseId: report.toolUseId,
  })
  return [
    ...head,
    head.length > 0 && !isBlankText(sections) ? SECTIONS_START_MARKDOWN : "",
    sections,
    isBlankText(report.favor) ? "" : `<div class="note note-favor">\n\n${report.favor}\n\n</div>`,
  ]
    .filter((part) => !isBlankText(part))
    .join("\n\n")
}

/** 段取りと検証結果を、結論と本文のあいだの1つのまとまりに包む。どちらも無ければ包みごと置かない。 */
function statusMarkdown(workPlan: string, checks: string): string {
  const parts = [
    isBlankText(workPlan) ? "" : `<div class="status-caption">進み具合</div>\n\n${workPlan}`,
    checks,
  ].filter((part) => !isBlankText(part))
  return parts.length === 0 ? "" : `<div class="status">\n\n${parts.join("\n\n")}\n\n</div>`
}

function workPlanMarkdown(plan: LatestWorkPlan): string {
  return plan.kind === "none"
    ? ""
    : reportSectionsMarkdown(
        [
          {
            heading: "",
            blocks: [{ kind: "progress", steps: plan.phases, current: plan.current, fold: "" }],
          },
        ],
        { kind: "none" },
      )
}

/**
 * まとめたやり取りと、その中で `report` ツールから来たステップの id（呼ばれた順）。id の並びは
 * 描く側へ渡さない（どの本文を出すかを決めるまでの材料で、決めたあとは本文の有無と印に畳まれる）。
 */
type GroupedTurn = {
  readonly turn: MainViewTurn
  readonly toolReportIds: readonly number[]
}

/**
 * 時系列に積まれた記録を、利用者の依頼を境目にしてやり取りごとへまとめる（割るのは {@link splitIntoTurns}）。
 * 割るのは表示の形に変えたあとなので、依頼より前のまとまりは、メインビューに出す記録（セリフと圧縮の区切りを落としたあと）が1件でもあるときだけできる。
 */
function groupIntoTurns(entries: readonly MainViewEntry[]): readonly GroupedTurn[] {
  return splitIntoTurns(entries).map((turn) => {
    const failure = turn.records.findLast(isTurnFailure)
    const { steps, toolReportIds } = groupIntoSteps(turn.records.filter(isStepEntry))
    return {
      turn: {
        id: turnIdOf(turn),
        request:
          turn.kind === "pre-request"
            ? undefined
            : { text: turn.request.text, images: turn.request.images },
        steps,
        hasInterimReport: false,
        droppedCount: 0,
        failure:
          failure === undefined ? { kind: "none" } : { kind: "failed", failure: failure.failure },
      },
      toolReportIds,
    }
  })
}

/** やり取りの中の記録のうち、ステップに入るもの（失敗の印以外）。 */
type StepEntry = Exclude<TurnRest<MainViewEntry>, { readonly kind: "turn-failure" }>

function isTurnFailure(
  entry: TurnRest<MainViewEntry>,
): entry is Extract<MainViewEntry, { readonly kind: "turn-failure" }> {
  return entry.kind === "turn-failure"
}

function isStepEntry(entry: TurnRest<MainViewEntry>): entry is StepEntry {
  return entry.kind !== "turn-failure"
}

/**
 * 1つのやり取りの中のステップと、`report` ツールから来たステップの id（{@link GroupedTurn}）。
 * ステップの id は {@link limitTurnEntries} で古いステップを落とす前に振り切る（落としたあとに振り直すと「番号がずれない」約束を満たせなくなる）。
 */
type GroupedSteps = {
  readonly steps: readonly MainViewStep[]
  readonly toolReportIds: readonly number[]
}

/** やり取り1つぶんの記録（依頼の後ろ）を、本文1件ごとのステップにまとめる。 */
function groupIntoSteps(entries: readonly StepEntry[]): GroupedSteps {
  return entries.reduce<GroupedSteps>(
    ({ steps, toolReportIds }, entry) => {
      const id = steps.length
      if (entry.kind === "detail" || entry.kind === "report") {
        const task = entry.kind === "report" ? entry.task : NO_REPORT_TASK
        const body = {
          kind: "text",
          report: entry.markdown,
          firstLine: extractFirstLine(firstLineSource(entry)),
          task,
          finishedPhase: NO_PHASE_LABEL,
        } as const satisfies MainViewStepBody
        return {
          steps: [...steps, newStep(id, body, [])],
          toolReportIds: entry.kind === "report" ? [...toolReportIds, id] : toolReportIds,
        }
      }
      if (entry.kind === "phase-shift") {
        return { steps: [...steps, phaseShiftStep(id, entry.shift)], toolReportIds }
      }

      const step = steps.at(-1)
      // レポートより前に起きたことは、レポートを持たないステップにまとめる。
      return {
        steps:
          step === undefined
            ? [newStep(id, NO_BODY, [entry])]
            : [...steps.slice(0, -1), { ...step, actions: [...step.actions, entry] }],
        toolReportIds,
      }
    },
    { steps: [], toolReportIds: [] },
  )
}

/** 作ったばかりのステップ。印（`interim` / `superseded` / `final`）はあとのパスが立てる。 */
function newStep(
  id: number,
  body: MainViewStepBody,
  actions: readonly MainViewAction[],
): MainViewStep {
  return {
    id,
    body,
    interim: false,
    superseded: false,
    final: false,
    phaseNotice: NO_PHASE_LABEL,
    actions,
  }
}

/**
 * 段が移った `work_plan` のステップ。終えた段のまとめがあれば本文にし、届いた時点で中間レポートと決める
 * （あとから最終レポートへ回ることが無いので、`interim` をここで立てる）。
 */
function phaseShiftStep(id: number, shift: PhaseShift): MainViewStep {
  const step = newStep(
    id,
    shift.finished.kind === "none"
      ? NO_BODY
      : {
          kind: "text",
          report: shift.finished.summary,
          firstLine: extractFirstLine(shift.finished.label),
          task: NO_REPORT_TASK,
          finishedPhase: { kind: "phase", label: shift.finished.label },
        },
    [],
  )
  return {
    ...step,
    interim: shift.finished.kind === "finished",
    phaseNotice:
      shift.entered.kind === "none"
        ? NO_PHASE_LABEL
        : { kind: "phase", label: shift.entered.label },
  }
}

/**
 * `report` ツールが1回も呼ばれなかったやり取りの本文を選ぶ。
 * 出すのは最後の本文（空白だけのものは除く）1つだけで、それが最終レポートになる。
 * それより前の本文は、資料らしい形をしていても出さない（中間レポートは `report` ツールと段のまとめからしか生まれない）。
 * 段のまとめ（{@link isDecidedStep}）はそのまま出す。
 *
 * `settled` でないあいだは何も出さない。
 * 書きかけは最後のステップへ積まれるので、最後の本文はまだ伸びる途中か、次の本文に席を譲るかもしれない。
 * 出してから変わると、書き上げる演出（マウントした時点でしか始まらない）が確定した本文に掛からない。
 */
function selectLastText(turn: MainViewTurn, settled: boolean): MainViewTurn {
  const lastId = settled
    ? turn.steps.findLast(
        (step) => !step.interim && step.body.kind === "text" && !isBlankText(step.body.report),
      )?.id
    : undefined
  return {
    ...turn,
    steps: turn.steps.map((step) =>
      step.id === lastId || isDecidedStep(step) ? step : { ...step, body: NO_BODY },
    ),
  }
}

/**
 * 選ぶ前から出し方が決まっているステップ（本文が無いか、段のまとめ）。
 * 段のまとめは届いた時点で中間レポートと決まるので、ターンが動いているあいだも伏せず、最後の本文・最後の `report` の候補にもしない。
 */
function isDecidedStep(step: MainViewStep): boolean {
  return step.body.kind === "none" || step.interim
}

/**
 * `report` ツールが呼ばれたやり取りの本文を選ぶ。
 * 出すのは `report` から来たステップと段のまとめ（{@link isDecidedStep}）だけで、ツールの外に書いた本文は1つも出さない（推測の {@link selectLastText} は通さない）。
 * 最後の呼び出しが最終レポート、それより前は中間レポートで、あとに作業が続いたかどうかは見ない。
 *
 * `settled` でないあいだ、いちばん新しい `report` は出さない（次の `report` が来れば中間レポートに、来なければ最終レポートになるので、まだ決まっていない）。
 * 先に出すと、あとから中間へ変わったときに囲いが反転し、最終へ残ったときも書き上げる演出（マウントした時点でしか始まらない）が掛からない。
 */
function selectToolReports(
  turn: MainViewTurn,
  toolReportIds: readonly number[],
  settled: boolean,
): MainViewTurn {
  const lastId = toolReportIds.at(-1)
  return {
    ...turn,
    steps: turn.steps.map((step) => {
      if (!toolReportIds.includes(step.id)) {
        return isDecidedStep(step) ? step : { ...step, body: NO_BODY }
      }
      if (step.id !== lastId) {
        return { ...step, interim: true }
      }
      return settled ? step : { ...step, body: NO_BODY }
    }),
  }
}

/**
 * 各ステップに「自分より後ろに本文を持つステップがあるか」（`superseded`）を立てる。
 * `interim` の判定そのもの（{@link selectToolReports}）は変えず、ここで足すのは「畳むかどうか」の材料だけ。
 * 位置関係だけで決まる値なので、`interim` かどうかを問わず全ステップに立てる（畳む側で `interim` と組み合わせる）。
 */
function markSupersededSteps(turn: MainViewTurn): MainViewTurn {
  const { steps } = turn.steps.reduceRight<{
    steps: readonly MainViewStep[]
    followedByReport: boolean
  }>(
    (acc, step) => ({
      steps: [{ ...step, superseded: acc.followedByReport }, ...acc.steps],
      followedByReport: acc.followedByReport || step.body.kind === "text",
    }),
    { steps: [], followedByReport: false },
  )
  return { ...turn, steps }
}

// 畳んだ `<summary>` に出す先頭行の長さの上限。「中間レポート」のラベルと並べる短い添え書きなので短く抑える。
const MAX_STEP_SUMMARY_LENGTH = 40

/**
 * 畳んだときの先頭行を取り出す元の文。
 * `task` のあるレポートは本文の頭が結論を包む HTML なので、組む前の結論から取る。
 * 作業の名前は同じ作業の中間レポートで全部同じになり見分けが付かないので、結論が空のときだけ使う。
 */
function firstLineSource(
  entry: Extract<StepEntry, { readonly kind: "detail" | "report" }>,
): string {
  if (entry.kind === "detail" || entry.task.kind !== "task") {
    return entry.markdown
  }
  return isBlankText(entry.conclusion) ? entry.task.name : entry.conclusion
}

/**
 * 本文の先頭行。空行は読み飛ばす。
 * 見出し（`# `〜`###### `）ならマークを落としてその語だけを返す。
 * 見出し以外の行（表・箇条書き・引用・行頭の HTML タグなど）はマークを落とさずそのまま返す（迷ったところは変えない側に倒す）。
 */
function extractFirstLine(markdown: string): string {
  const line = markdown
    .split("\n")
    .map((raw) => raw.trim())
    .find((trimmed) => trimmed !== "")
  if (line === undefined) {
    return ""
  }

  const heading = /^#{1,6}\s+(.*)$/.exec(line)
  const text = heading?.[1] === undefined ? line : heading[1].trim()
  return text.length <= MAX_STEP_SUMMARY_LENGTH
    ? text
    : `${text.slice(0, MAX_STEP_SUMMARY_LENGTH)}…`
}

/**
 * 最終レポート（そのやり取りで最後の、中間でない本文）に印を立て、同じやり取りに中間レポートがあるかどうかを畳む。
 * 引くのは1箇所だけにして、描く側が「最後の、中間でない本文」の条件を持たずに済むようにする。
 *
 * 2つに分かれているのは、地の段とラベルで条件が違うため。
 * 地は最終レポートなら常に1段上げ、ラベル（「最終レポート」）は中間レポートのあるやり取りか、本文に `task` があるときだけ出す。
 *
 * `closed` が false のとき（{@link mainViewTurns} の同名の引数）は `final` を1つも立てない。
 * やり取りがまだ閉じていないあいだは、次の `report` が来てこの本文が中間レポートへ回るかもしれないので、確定していないものに最終レポートの札（ラベルも地の段上げも）を立てない。
 * `hasInterimReport` は `closed` に関係なく `interim` の集計のまま。
 *
 * `interim` の判定（{@link selectToolReports}）も `superseded`（{@link markSupersededSteps}）も変えない。
 */
function markFinalReport(turn: MainViewTurn, closed: boolean): MainViewTurn {
  const finalId = closed
    ? turn.steps.findLast((step) => step.body.kind === "text" && !step.interim)?.id
    : undefined
  return {
    ...turn,
    steps: turn.steps.map((step) => ({ ...step, final: step.id === finalId })),
    hasInterimReport: turn.steps.some((step) => step.interim),
  }
}

/**
 * 1つのやり取りが画面に出す記録を上限まで切り詰める。落とすのは古いほう（今回の続きを残す）。
 * 数えるのは画面に出るものだけなので、ツールを何十件呼んでも落ちない（{@link MAX_MAIN_VIEW_ENTRIES}）。
 */
function limitTurnEntries(turn: MainViewTurn): MainViewTurn {
  const counts = turn.steps.map(shownEntryCount)
  const total = sum(counts)
  if (total <= MAX_MAIN_VIEW_ENTRIES) {
    return turn
  }

  const kept: MainViewStep[] = []
  let remaining = MAX_MAIN_VIEW_ENTRIES
  for (const [index, step] of [...turn.steps].reverse().entries()) {
    const count = counts[counts.length - 1 - index] ?? 0
    if (count > remaining) {
      break
    }
    kept.unshift(step)
    remaining -= count
  }

  return { ...turn, steps: kept, droppedCount: total - (MAX_MAIN_VIEW_ENTRIES - remaining) }
}

/**
 * そのステップが画面に出す記録の件数。
 * 描く側が描くもの（レポート・段の知らせ・質問の記録）だけを数え、ツールの実行は数えない（メインビューに出ないため）。
 * 描く側が出すものを変えたら、ここも揃える。
 */
function shownEntryCount(step: MainViewStep): number {
  return (
    (step.body.kind === "none" ? 0 : 1) +
    (step.phaseNotice.kind === "none" ? 0 : 1) +
    step.actions.filter((action) => action.kind === "question").length
  )
}
