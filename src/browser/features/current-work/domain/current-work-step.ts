// 依頼の手順とバックグラウンドタスクを、一覧に出す形と1行の要約へ畳む。

import type {
  BackgroundTask,
  BackgroundTaskKind,
} from "../../../../shared/session-driver/background-task.ts"
import { MAX_TOOL_TEXT_LENGTH } from "../../../../shared/session/session-state.ts"
import {
  toolDuration,
  type TurnStep,
  type TurnStepStatus,
} from "../../../../shared/session/turn-step.ts"
import {
  PHASE_SPAN_NAMES,
  phasePosition,
  type WorkPhase,
} from "../../../../shared/session/work-plan.ts"
import { clipText, type ClippedText } from "../../../../shared/utils/clip-text.ts"
import { formatElapsed } from "../../../../shared/utils/elapsed-time.ts"
import { summarizeToolInput } from "../../../domain/tool-summary.ts"

export type CurrentWorkStep = {
  readonly key: string
  readonly label: string
  readonly nested: boolean
  readonly status: TurnStepStatus
  readonly failure: CurrentWorkStepFailure
}

export type CurrentWorkStepFailure =
  | { readonly kind: "none" }
  | { readonly kind: "failed"; readonly outputText: string; readonly inputText: string }

/**
 * 手順を始まったときの段で区切った1まとまり。
 * 小見出しは群の名のタグと「2/4 段の名前」で、段取りより前・全部の段を終えたあとの手順は小見出しを持たない。
 * `spanName` は群の名「前」「本」「後」（範囲が無い・番号を持たない段では空）、`label` は群の名を除いた見出し、
 * `phaseIndexes` は小見出しの段の平らにした並びでの位置（{@link WorkPhase} の `indexes`）。
 */
export type CurrentWorkStepGroup = {
  readonly key: string
  readonly heading:
    | { readonly kind: "none" }
    | {
        readonly kind: "phase"
        readonly spanName: string
        readonly label: string
        readonly phaseIndexes: readonly number[]
      }
  readonly steps: readonly CurrentWorkStep[]
}

export const BACKGROUND_TASK_KIND_LABEL = {
  shell: "シェル",
  agent: "サブエージェント",
  other: "その他",
} satisfies Record<BackgroundTaskKind, string>

/**
 * 並びの隣どうしで段が同じ手順を1まとまりにし、群も群の中の手順も新しい順で返す。
 * 段を戻る段取りの変更があっても、まとまりは並びの順で切る。
 */
export function currentWorkStepGroups(steps: readonly TurnStep[]): readonly CurrentWorkStepGroup[] {
  const headings = steps.map((step) => stepGroupHeading(step.phase))
  const starts = headings.flatMap((heading, index) =>
    index === 0 || !sameHeading(headings[index - 1] ?? heading, heading) ? [index] : [],
  )
  return starts
    .flatMap((start, position) => {
      const first = steps[start]
      const heading = headings[start]
      return first === undefined || heading === undefined
        ? []
        : [
            {
              key: first.toolUseId,
              heading,
              steps: steps
                .slice(start, starts[position + 1] ?? steps.length)
                .map(toStepView)
                .toReversed(),
            },
          ]
    })
    .toReversed()
}

/**
 * 手順1件の見出し。終わっていて所要時間が測れれば（{@link toolDuration}）末尾に添える。
 * 復元した手順は測れないので添えない。
 */
export function currentWorkStepLabel(step: TurnStep): string {
  const summary = summarizeToolInput(step.name, step.input)
  const base = summary === "" ? step.name : `${step.name}: ${summary}`
  const duration = toolDuration(step)
  return duration.kind === "known"
    ? `${base}（${formatElapsed(Math.round(duration.milliseconds / 1000))}）`
    : base
}

/**
 * バックグラウンドタスクの要約。いちばん新しく始まったもの（並びの末尾）の説明を出し、2件以上あれば「ほか n件」を添える。
 * 説明が無ければ種類の語で代える。
 */
export function backgroundSummaryLabel(tasks: readonly BackgroundTask[]): string | undefined {
  const newest = tasks.at(-1)
  if (newest === undefined) {
    return undefined
  }
  const label = backgroundTaskLabel(newest)
  return tasks.length > 1 ? `${label} ほか${String(tasks.length - 1)}件` : label
}

/** 画面に出す長さで切り、落とした文字数を添える。 */
export function truncateForDisplay(text: string): string {
  return clippedTextLabel(clipText(text, MAX_TOOL_TEXT_LENGTH))
}

function backgroundTaskLabel(task: BackgroundTask): string {
  return task.description === "" ? BACKGROUND_TASK_KIND_LABEL[task.kind] : task.description
}

function stepGroupHeading(phase: WorkPhase): CurrentWorkStepGroup["heading"] {
  if (phase.kind !== "phase") {
    return { kind: "none" }
  }
  const number = phasePosition(phase)
  return number.kind === "numbered"
    ? {
        kind: "phase",
        spanName: PHASE_SPAN_NAMES[number.span],
        label: `${number.text} ${phase.name}`,
        phaseIndexes: phase.indexes,
      }
    : { kind: "phase", spanName: "", label: phase.name, phaseIndexes: phase.indexes }
}

function sameHeading(
  a: CurrentWorkStepGroup["heading"],
  b: CurrentWorkStepGroup["heading"],
): boolean {
  return a.kind === "phase" && b.kind === "phase"
    ? a.spanName === b.spanName && a.label === b.label
    : a.kind === b.kind
}

function toStepView(step: TurnStep): CurrentWorkStep {
  return {
    key: step.toolUseId,
    label: currentWorkStepLabel(step),
    nested: step.nested,
    status: step.status,
    failure:
      step.status.kind === "failed"
        ? {
            kind: "failed",
            outputText: clippedTextLabel(step.status.output),
            inputText: truncateForDisplay(stringifyToolInput(step.input)),
          }
        : { kind: "none" },
  }
}

function stringifyToolInput(input: unknown): string {
  if (input === undefined) {
    return ""
  }

  const json = JSON.stringify(input, null, 2)
  return json ?? String(input)
}

/** 切った先頭に、落とした文字数だけを添える。 */
function clippedTextLabel(clipped: ClippedText): string {
  if (clipped.omittedLength === 0) {
    return clipped.head
  }

  return `${clipped.head}\n…（以下 ${String(clipped.omittedLength)} 文字を省略）`
}
