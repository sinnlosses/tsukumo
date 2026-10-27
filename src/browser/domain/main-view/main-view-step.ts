// メインビューの記録を、やり取り（ターン）とステップにまとめる。
// 本文の選び方は持たず、まとめた直後の形までを作る。

import { foldInlineMarks } from "../../../shared/report/inline-mark.ts"
import { NO_REPORT_CHANGE_SUMMARY } from "../../../shared/report/report-change-summary.ts"
import { NO_REPORT_TASK } from "../../../shared/report/report-task.ts"
import {
  type MainViewAction,
  type MainViewAside,
  type MainViewEntry,
  type MainViewPhaseLabel,
  type MainViewStep,
  type MainViewStepBody,
  type MainViewTurn,
  NO_BODY,
} from "../../../shared/session/main-view-shape.ts"
import { splitIntoTurns, type TurnRest, turnIdOf } from "../../../shared/session/turn.ts"
import type { PhaseShift } from "../../../shared/session/work-plan-shift.ts"
import { isBlankText } from "../../../shared/utils/blank-text.ts"
import { clipWithEllipsis } from "../../../shared/utils/clip-text.ts"
import type { MeasuredTime } from "../../../shared/utils/elapsed-time.ts"
import { orderedReportRegions } from "./main-view-report-body.ts"

const NO_PHASE_LABEL = { kind: "none" } as const satisfies MainViewPhaseLabel

/**
 * まとめたやり取りと、その中で `report` ツールから来たステップの id（呼ばれた順）。id の並びは
 * 描く側へ渡さない（どの本文を出すかを決めるまでの材料で、決めたあとは本文の有無と印に畳まれる）。
 */
export type GroupedTurn = {
  readonly turn: MainViewTurn
  readonly toolReportIds: readonly number[]
}

/**
 * 時系列に積まれた記録を、利用者の依頼を境目にしてやり取りごとへまとめる（割るのは {@link splitIntoTurns}）。
 * 割るのは表示の形に変えたあとなので、依頼より前のまとまりは、メインビューに出す記録（セリフと圧縮の区切りを落としたあと）が1件でもあるときだけできる。
 */
export function groupIntoTurns(entries: readonly MainViewEntry[]): readonly GroupedTurn[] {
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

/** やり取りの中の記録のうち、ステップに入らないもの（失敗の印）。 */
type OutsideStepEntry = Extract<MainViewEntry, { readonly kind: "turn-failure" }>

type StepEntry = Exclude<TurnRest<MainViewEntry>, OutsideStepEntry>

function isTurnFailure(entry: TurnRest<MainViewEntry>): entry is OutsideStepEntry {
  return entry.kind === "turn-failure"
}

function isStepEntry(entry: TurnRest<MainViewEntry>): entry is StepEntry {
  return entry.kind !== "turn-failure"
}

/**
 * 1つのやり取りの中のステップと、`report` ツールから来たステップの id（{@link GroupedTurn}）。
 * ステップの id は `limitTurnEntries` で古いステップを落とす前に振り切る（落としたあとに振り直すと「番号がずれない」約束を満たせなくなる）。
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
          report:
            entry.kind === "report"
              ? entry.regions
              : { kind: "markdown", markdown: entry.markdown },
          firstLine: extractFirstLine(firstLineSource(entry)),
          task,
          finishedPhase: NO_PHASE_LABEL,
          changeSummary: entry.kind === "report" ? entry.changeSummary : NO_REPORT_CHANGE_SUMMARY,
        } as const satisfies MainViewStepBody
        return {
          steps: [...steps, newStep(id, body, [])],
          toolReportIds: entry.kind === "report" ? [...toolReportIds, id] : toolReportIds,
        }
      }
      if (entry.kind === "phase-shift") {
        return {
          steps: [...steps, phaseShiftStep(id, entry.shift, entry.duration)],
          toolReportIds,
        }
      }

      if (entry.kind === "aside") {
        const aside = {
          text: entry.text,
          answer: { kind: "waiting" },
        } as const satisfies MainViewAside
        const last = steps.at(-1)
        return {
          steps:
            last === undefined
              ? [{ ...newStep(id, NO_BODY, []), asides: [aside] }]
              : replaceStep(steps, steps.length - 1, { ...last, asides: [...last.asides, aside] }),
          toolReportIds,
        }
      }
      if (entry.kind === "aside-answer") {
        return { steps: answerLastAside(steps, entry.text), toolReportIds }
      }

      const step = steps.at(-1)
      // レポートより前に起きたことは、レポートを持たないステップにまとめる。
      // 脇の話が最後に出ているステップへ足すと脇の話の欄より上に描かれるので、新しいステップに入れる。
      return {
        steps:
          step === undefined || step.asides.length > 0
            ? [...steps, newStep(id, NO_BODY, [entry])]
            : replaceStep(steps, steps.length - 1, { ...step, actions: [...step.actions, entry] }),
        toolReportIds,
      }
    },
    { steps: [], toolReportIds: [] },
  )
}

/**
 * やり取りで最後の脇の話に答えのセリフをつなぐ（2つ以上は届いた順に空白でつなぐ）。
 * 脇の話より前の答えのセリフは捨てる。
 */
function answerLastAside(steps: readonly MainViewStep[], text: string): readonly MainViewStep[] {
  const index = steps.findLastIndex((step) => step.asides.length > 0)
  const step = steps[index]
  const last = step?.asides.at(-1)
  if (step === undefined || last === undefined) {
    return steps
  }
  const answered = last.answer.kind === "answered" ? `${last.answer.text} ${text}` : text
  return replaceStep(steps, index, {
    ...step,
    asides: [
      ...step.asides.slice(0, -1),
      { text: last.text, answer: { kind: "answered", text: answered } },
    ],
  })
}

function replaceStep(
  steps: readonly MainViewStep[],
  index: number,
  step: MainViewStep,
): readonly MainViewStep[] {
  return steps.map((current, currentIndex) => (currentIndex === index ? step : current))
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
    actions,
    asides: [],
  }
}

/**
 * 段が移った `work_plan` のステップ。終えた段のまとめがあれば本文にし、届いた時点で中間レポートと決める
 * （あとから最終レポートへ回ることが無いので、`interim` をここで立てる）。
 */
function phaseShiftStep(id: number, shift: PhaseShift, duration: MeasuredTime): MainViewStep {
  const step = newStep(
    id,
    shift.finished.kind === "none"
      ? NO_BODY
      : {
          kind: "text",
          report: { kind: "markdown", markdown: shift.finished.summary },
          firstLine: extractFirstLine(shift.finished.label),
          task: NO_REPORT_TASK,
          finishedPhase: {
            kind: "phase",
            label: shift.finished.label,
            duration,
            skipped: shift.finished.skipped,
          },
          changeSummary: NO_REPORT_CHANGE_SUMMARY,
        },
    [],
  )
  return {
    ...step,
    interim: shift.finished.kind === "finished",
  }
}

// 畳んだ `<summary>` に出す先頭行の長さの上限。「中間レポート」のラベルと並べる短い添え書きなので短く抑える。
const MAX_STEP_SUMMARY_LENGTH = 40

/**
 * 畳んだときの先頭行を取り出す元の文。
 * `report` の本文の頭は結論を包む HTML なので、組む前の結論から取る。
 * 作業の名前は同じ作業の中間レポートで全部同じになり見分けが付かないので、結論が空のときだけ使う。
 */
function firstLineSource(
  entry: Extract<StepEntry, { readonly kind: "detail" | "report" }>,
): string {
  if (entry.kind === "detail") {
    return entry.markdown
  }
  if (!isBlankText(entry.conclusion)) {
    return entry.conclusion
  }
  return entry.task.kind === "task"
    ? entry.task.name
    : (orderedReportRegions(entry.regions).at(0)?.markdown ?? "")
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
  const text = foldInlineMarks(heading?.[1] === undefined ? line : heading[1].trim())
  return clipWithEllipsis(text, MAX_STEP_SUMMARY_LENGTH)
}
