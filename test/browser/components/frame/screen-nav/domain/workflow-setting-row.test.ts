import { describe, expect, it } from "vitest"

import {
  failureAfterSave,
  workflowDraftChange,
} from "../../../../../../src/browser/components/frame/screen-nav/domain/workflow-setting-row.ts"
import type {
  WorkflowSettingChoiceField,
  WorkflowSettingStepsField,
} from "../../../../../../src/shared/workflow-setting/workflow-setting.ts"

const steps: WorkflowSettingStepsField = {
  kind: "steps",
  key: "架空の並び",
  label: "並び",
  description: "",
  values: [
    { value: "甲", label: "架空の甲", title: "甲の段", description: "" },
    { value: "乙", label: "架空の乙", title: "乙の段", description: "" },
    { value: "丙", label: "架空の丙", title: "丙の段", description: "" },
  ],
  current: ["甲", "乙", "丙"],
}

const choice: WorkflowSettingChoiceField = {
  kind: "choice",
  key: "架空の選択",
  label: "選択",
  description: "",
  values: [{ value: "甲", label: "架空の甲", description: "" }],
  current: "甲",
}

describe("workflowDraftChange", () => {
  it("下書きが無ければ none", () => {
    expect(workflowDraftChange([], new Map())).toEqual({ kind: "none" })
  })

  it("並びから1つだけ外して順がそのままなら、その段の名前で「を外した」", () => {
    const drafts = new Map([[steps.key, ["甲", "丙"]]])
    expect(workflowDraftChange([steps], drafts)).toEqual({
      kind: "changed",
      text: "乙の段を外した",
    })
  })

  it("入れ替えは「並びを変えた」", () => {
    const drafts = new Map([[steps.key, ["乙", "甲", "丙"]]])
    expect(workflowDraftChange([steps], drafts)).toEqual({ kind: "changed", text: "並びを変えた" })
  })

  it("選択の1欄だけなら欄の名前で「を変えた」", () => {
    expect(workflowDraftChange([choice], new Map())).toEqual({
      kind: "changed",
      text: "選択を変えた",
    })
  })

  it("並び以外を含む複数は「設定を変えた」", () => {
    expect(workflowDraftChange([steps, choice], new Map())).toEqual({
      kind: "changed",
      text: "設定を変えた",
    })
  })
})

describe("failureAfterSave", () => {
  const writes = [{ key: "架空の並び", value: "[]" }]

  it("断られたら、断られた欄に理由を付ける", () => {
    expect(
      failureAfterSave({ kind: "failed", key: "架空の選択", message: "架空の理由" }, writes),
    ).toEqual({ kind: "shown", key: "架空の選択", message: "架空の理由" })
  })

  it("届かなかったら、最初に書く欄に届かなかった知らせを付ける", () => {
    expect(failureAfterSave({ kind: "unsent" }, writes)).toMatchObject({
      kind: "shown",
      key: "架空の並び",
    })
  })

  it("書けたら知らせを消す", () => {
    expect(failureAfterSave({ kind: "saved" }, writes)).toEqual({ kind: "none" })
  })
})
