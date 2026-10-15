// ワークフローの設定の欄1つに出す選択肢。
// `part` の候補はワークフローからは来ないので、SDK が `init` で返したスキルとエージェントの名前から作る。

import type {
  WorkflowSettingField,
  WorkflowSettingSingleField,
  WorkflowSettingStepsField,
} from "./workflow-setting.ts"

export type WorkflowSettingOption = {
  readonly value: string
  readonly label: string
}

/** 既定の語・なしの語（`tw config --schema` の `default_word`・`none_word`）。 */
export type WorkflowSettingWords = {
  readonly defaultWord: string
  readonly noneWord: string
}

/** SDK が `init` で返した名前（`SessionState` の `skillNames`・`agentNames`）。 */
export type WorkflowSettingCandidateNames = {
  readonly skillNames: readonly string[]
  readonly agentNames: readonly string[]
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
export function workflowSettingSteps(field: WorkflowSettingStepsField): WorkflowSettingSteps {
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

/**
 * `choice` は `values` の並びのまま。
 * `part` は既定の語、`allowNone` ならなしの語、続けて `candidates` に当たる一覧の名前の順。
 * どちらも今の値が並びに無ければ（`init` が届く前・一覧から消えた）末尾に足し、選んでいる値を失わない。
 */
export function workflowSettingOptions(
  field: WorkflowSettingSingleField,
  words: WorkflowSettingWords,
  names: WorkflowSettingCandidateNames,
): readonly WorkflowSettingOption[] {
  const options =
    field.kind === "choice"
      ? field.values.map((choice) => ({ value: choice.value, label: choice.label }))
      : partValues(field, words, names).map((value) => ({ value, label: value }))
  return options.some((option) => option.value === field.current)
    ? options
    : [...options, { value: field.current, label: field.current }]
}

function partValues(
  field: Extract<WorkflowSettingField, { kind: "part" }>,
  words: WorkflowSettingWords,
  names: WorkflowSettingCandidateNames,
): readonly string[] {
  const reserved = field.allowNone ? [words.defaultWord, words.noneWord] : [words.defaultWord]
  const candidates = field.candidates === "agent" ? names.agentNames : names.skillNames
  return [...new Set([...reserved, ...candidates])]
}
