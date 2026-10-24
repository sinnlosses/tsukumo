import { createRouterClient } from "@orpc/server"
import { describe, expect, it } from "vitest"

import {
  workflowSettingCommandProcedure,
  workflowSettingProcedure,
} from "../../../../src/server/workflow-setting/adapter/workflow-setting-procedure.ts"
import type { WorkflowSettingView } from "../../../../src/shared/workflow-setting/workflow-setting.ts"

const VIEW: WorkflowSettingView = {
  kind: "available",
  repository: { worktreeName: "架空の作業ツリー", configPath: "/架空/根/.tw/config.toml" },
  fields: [
    {
      kind: "steps",
      key: "steps",
      label: "並び",
      description: "並びの説明",
      values: [{ value: "架空:一つ目", label: "一つ目", title: "架空の一つ目", description: "" }],
      current: ["架空:一つ目"],
    },
  ],
}

describe("workflowSetting の手続き", () => {
  it("read は口が畳んだ面をそのまま返す", async () => {
    const client = createRouterClient(
      workflowSettingProcedure({
        readWorkflowSetting: () => Promise.resolve(VIEW),
        readWorkflowEntries: () => Promise.resolve([{ value: "架空の入口", title: "架空の題" }]),
      }),
    )

    expect(await client.read()).toEqual(VIEW)
    expect(await client.entries()).toEqual([{ value: "架空の入口", title: "架空の題" }])
  })

  it("set は欄と値を口へ渡し、口が畳んだ結果をそのまま返す", async () => {
    const calls: (readonly [string, string])[] = []
    const client = createRouterClient(
      workflowSettingCommandProcedure({
        changeWorkflowSetting: (key, value) => {
          calls.push([key, value])
          return Promise.resolve({ kind: "view", view: VIEW })
        },
      }),
    )

    const change = await client.set({ key: "steps", value: '["架空:一つ目"]' })

    expect(calls).toEqual([["steps", '["架空:一つ目"]']])
    expect(change).toEqual({ kind: "view", view: VIEW })
  })
})
