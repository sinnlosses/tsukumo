import { describe, expect, it } from "vitest"

import {
  isWorkflowCommandSaveable,
  workflowSettingChoiceOptions,
  workflowSettingSteps,
} from "../../../../../../src/browser/components/domain/screen-nav/domain/workflow-setting-option.ts"
import type {
  WorkflowSettingChoiceField,
  WorkflowSettingField,
} from "../../../../../../src/shared/workflow-setting/workflow-setting.ts"

describe("workflowSettingChoiceOptions", () => {
  const field: WorkflowSettingChoiceField = {
    kind: "choice",
    key: "架空の選択",
    label: "選択",
    description: "",
    values: [
      { value: "甲", label: "架空の甲", description: "甲の説明" },
      { value: "乙", label: "架空の乙", description: "乙の説明" },
    ],
    current: "甲",
  }

  it("選択肢は values の順で、下書きと同じ値だけ selected になる", () => {
    expect(workflowSettingChoiceOptions(field, "乙")).toEqual([
      { value: "甲", label: "架空の甲", description: "甲の説明", selected: false },
      { value: "乙", label: "架空の乙", description: "乙の説明", selected: true },
    ])
  })

  it("下書きが values に無い名前でも選択肢は増えず、どれも selected にならない", () => {
    const options = workflowSettingChoiceOptions(field, "架空:消えた")

    expect(options).toHaveLength(2)
    expect(options.some((option) => option.selected)).toBe(false)
  })
})

describe("isWorkflowCommandSaveable", () => {
  it.each([
    ["", false],
    ["  \t", false],
    ["なし", true],
    ["架空のコマンド --x", true],
  ])("%j は %s", (draft, expected) => {
    expect(isWorkflowCommandSaveable(draft)).toBe(expected)
  })
})

describe("workflowSettingSteps", () => {
  const field: WorkflowSettingField = {
    kind: "steps",
    key: "steps",
    label: "並び",
    description: "",
    values: [
      { value: "架空:一つ目", label: "一つ目", title: "架空の一つ目", description: "" },
      { value: "架空:二つ目", label: "二つ目", title: "架空の二つ目", description: "二つ目の説明" },
    ],
    current: ["架空:二つ目", "架空:消えた"],
  }

  it("並びは今の値の順で、候補に無い名前も残して known を偽にし、名前は value で埋める", () => {
    expect(workflowSettingSteps(field).items).toEqual([
      {
        value: "架空:二つ目",
        label: "二つ目",
        title: "架空の二つ目",
        description: "二つ目の説明",
        known: true,
      },
      {
        value: "架空:消えた",
        label: "架空:消えた",
        title: "架空:消えた",
        description: "",
        known: false,
      },
    ])
  })

  it("足せるのは並びに無い候補だけ", () => {
    expect(workflowSettingSteps(field).addable).toEqual([
      { value: "架空:一つ目", label: "一つ目", title: "架空の一つ目" },
    ])
  })
})
