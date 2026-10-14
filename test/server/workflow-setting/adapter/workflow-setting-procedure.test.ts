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
  defaultWord: "既定の語",
  noneWord: "なしの語",
  fields: [
    {
      kind: "part",
      key: "parts.reviewer",
      label: "見る役",
      description: "見る役の説明",
      candidates: "agent",
      allowNone: false,
      current: "架空の役",
    },
  ],
}

describe("workflowSetting の手続き", () => {
  it("read は口が畳んだ面をそのまま返す", async () => {
    const client = createRouterClient(
      workflowSettingProcedure({ readWorkflowSetting: () => Promise.resolve(VIEW) }),
    )

    expect(await client.read()).toEqual(VIEW)
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

    const change = await client.set({ key: "parts.reviewer", value: "架空の役" })

    expect(calls).toEqual([["parts.reviewer", "架空の役"]])
    expect(change).toEqual({ kind: "view", view: VIEW })
  })
})
