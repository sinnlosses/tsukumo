import { describe, expect, it } from "vitest"

import { workflowSettingSteps } from "../../../src/shared/workflow-setting/workflow-setting-option.ts"
import type { WorkflowSettingField } from "../../../src/shared/workflow-setting/workflow-setting.ts"

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
