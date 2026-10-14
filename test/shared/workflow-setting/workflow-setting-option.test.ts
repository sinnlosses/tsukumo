import { describe, expect, it } from "vitest"

import { workflowSettingOptions } from "../../../src/shared/workflow-setting/workflow-setting-option.ts"
import type { WorkflowSettingField } from "../../../src/shared/workflow-setting/workflow-setting.ts"

const WORDS = { defaultWord: "既定", noneWord: "なし" }
const NAMES = {
  skillNames: ["架空のスキル", "架空のプラグイン:架空の振り返り"],
  agentNames: ["架空のプラグイン:架空の役", "架空の役"],
}

function part(
  overrides: Partial<Extract<WorkflowSettingField, { kind: "part" }>>,
): WorkflowSettingField {
  return {
    kind: "part",
    key: "parts.acceptor",
    label: "架空の枠",
    description: "架空の説明",
    candidates: "agent",
    allowNone: false,
    current: "既定",
    ...overrides,
  }
}

describe("workflowSettingOptions", () => {
  it("choice は values の並びのまま、表示名を label にする", () => {
    const field: WorkflowSettingField = {
      kind: "choice",
      key: "flow",
      label: "流れ",
      description: "",
      values: [
        { value: "delegate", label: "委譲する", description: "" },
        { value: "main", label: "メインで行う", description: "" },
      ],
      current: "main",
    }
    expect(workflowSettingOptions(field, WORDS, NAMES)).toEqual([
      { value: "delegate", label: "委譲する" },
      { value: "main", label: "メインで行う" },
    ])
  })

  it("part の agent は既定の語のあとにエージェントの名前を並べる（なしを許さない）", () => {
    expect(workflowSettingOptions(part({}), WORDS, NAMES).map((option) => option.value)).toEqual([
      "既定",
      "架空のプラグイン:架空の役",
      "架空の役",
    ])
  })

  it("part の skill で allowNone なら、既定の語・なしの語のあとにスキルの名前を並べる", () => {
    const field = part({ key: "parts.retrospect", candidates: "skill", allowNone: true })
    expect(workflowSettingOptions(field, WORDS, NAMES).map((option) => option.value)).toEqual([
      "既定",
      "なし",
      "架空のスキル",
      "架空のプラグイン:架空の振り返り",
    ])
  })

  it("今の値が一覧に無ければ末尾に足す（init が届く前も選んでいる値を失わない）", () => {
    const field = part({ current: "架空の別の役" })
    expect(
      workflowSettingOptions(field, WORDS, { skillNames: [], agentNames: [] }).map(
        (option) => option.value,
      ),
    ).toEqual(["既定", "架空の別の役"])
  })
})
