// 次の一手（`NextStep`）を、入力欄の頭の並びの1行の札に開く。
// 札の主の字は押すと入る文の1行目で、切らない。点を並べる文は点の数を添え、全文は下見が出す。

import type { NextStep } from "../../../../../../features/report/next-step.ts"

/**
 * `draft` は押すと入力欄に足す文。`alternative` は押すと案の札を開く札で、文を持たない。
 * `points` は文が並べる点の数（点を並べない文は 0）。
 */
export type NextStepChip =
  | {
      readonly kind: "draft"
      readonly key: string
      readonly kindLabel: string
      readonly label: string
      readonly points: number
      readonly draft: string
    }
  | {
      readonly kind: "alternative"
      readonly key: string
      readonly kindLabel: string
      readonly label: string
      readonly options: readonly NextStepChip[]
    }

/** 並びの順は `steps` のまま。 */
export function nextStepChipsOf(steps: readonly NextStep[]): readonly NextStepChip[] {
  return steps.flatMap((step): readonly NextStepChip[] => {
    if (step.kind === "alternative") {
      return [
        {
          kind: "alternative",
          key: step.kind,
          kindLabel: step.kindLabel,
          label: ALTERNATIVE_LABEL,
          options: step.alternatives.map((option) =>
            draftChip(`option:${option.name}`, option.name, option.draft),
          ),
        },
      ]
    }
    return [
      {
        kind: "draft",
        key: chipKeyOf(step),
        kindLabel: step.kindLabel,
        label: step.label,
        points: step.points,
        draft: step.draft,
      },
    ]
  })
}

/** 下書きにその文が入っているか（札の「入れた」の印）。 */
export function draftHolds(draftText: string, chipDraft: string): boolean {
  return chipDraft !== "" && draftText.includes(chipDraft)
}

const ALTERNATIVE_LABEL = "案を選ぶ"

/** 札の鍵。種類ごとに1つの札は種類、複数になりうる札は種類に中身を添える。 */
function chipKeyOf(step: Exclude<NextStep, { readonly kind: "alternative" }>): string {
  switch (step.kind) {
    case "next-task":
      return `next-task:${step.taskId}`
    case "suggestion":
      return `suggestion:${step.draft}`
    default:
      return step.kind
  }
}

/** 1行の下書きの札（案の札）。 */
function draftChip(key: string, kindLabel: string, draft: string): NextStepChip {
  return { kind: "draft", key, kindLabel, label: draft, points: 0, draft }
}
