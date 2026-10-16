// スキルの並びの欄の見せ方。候補は欄の `values` だけから作る。

import type { WorkflowSettingField } from "./workflow-setting.ts"

export type WorkflowSettingOption = {
  readonly value: string
  readonly label: string
}

/** `steps` の並びの1行。`known` が偽なら候補（`values`）に無い名前。 */
export type WorkflowSettingStepItem = {
  readonly value: string
  readonly label: string
  readonly known: boolean
}

/** `steps` の欄の見せ方。`items` は今の並び、`addable` は並びに無い候補。 */
export type WorkflowSettingSteps = {
  readonly items: readonly WorkflowSettingStepItem[]
  readonly addable: readonly WorkflowSettingOption[]
}

/**
 * 並びは今の値の順のまま、候補に無い名前も残して `known: false` を付ける。
 * 足せるのは `values` のうち並びに無いものだけで、SDK の一覧は使わない。
 */
export function workflowSettingSteps(field: WorkflowSettingField): WorkflowSettingSteps {
  const labels = new Map(field.values.map((choice) => [choice.value, choice.label] as const))
  return {
    items: field.current.map((value) => ({
      value,
      label: labels.get(value) ?? value,
      known: labels.has(value),
    })),
    addable: field.values
      .filter((choice) => !field.current.includes(choice.value))
      .map((choice) => ({ value: choice.value, label: choice.label })),
  }
}
