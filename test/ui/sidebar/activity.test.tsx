import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import { type ToolActivity } from "../../../src/protocol/session-state.ts"
import { Activity } from "../../../src/ui/sidebar/activity.tsx"

// フィクスチャはすべて手で書いた架空のツール呼び出し（docs/coding-standards.md「会話内容の扱い」）。

afterEach(() => {
  cleanup()
})

function activity(overrides: Partial<ToolActivity>): ToolActivity {
  return {
    toolUseId: "toolu_dummy",
    name: "Bash",
    input: { command: "echo dummy" },
    nested: false,
    startedAt: 0,
    ...overrides,
  }
}

describe("Activity", () => {
  it("実行中・完了のどちらも無いときは空であることを出す", () => {
    render(<Activity running={[]} finished={[]} />)

    expect(screen.getByText("いま動いているツールは無い")).toBeDefined()
  })

  it("実行中・終わったツールが新しい順に出る（実行中が先、完了はその下）", () => {
    const running = [
      activity({ toolUseId: "toolu_running_new", input: { command: "echo new" } }),
      activity({ toolUseId: "toolu_running_old", input: { command: "echo old" } }),
    ]
    const finished = [
      activity({
        toolUseId: "toolu_finished_new",
        name: "Edit",
        input: { file_path: "src/dummy.ts" },
      }),
    ]

    render(<Activity running={running} finished={finished} />)

    const items = screen.getAllByRole("listitem")
    expect(items.map((item) => item.textContent)).toEqual([
      "Bash: echo new",
      "Bash: echo old",
      "Edit: src/dummy.ts",
    ])
  })

  it("実行中は普通の色、完了は薄い色のクラスを持つ", () => {
    render(
      <Activity
        running={[activity({ toolUseId: "toolu_running" })]}
        finished={[activity({ toolUseId: "toolu_finished" })]}
      />,
    )

    const items = screen.getAllByRole("listitem")
    expect(items[0]?.className).toContain("activity-running")
    expect(items[1]?.className).toContain("activity-finished")
  })

  it("サブエージェントの中（nested）は1段下げるクラスを持つ", () => {
    render(<Activity running={[]} finished={[activity({ toolUseId: "toolu_1", nested: true })]} />)

    expect(screen.getByRole("listitem").className).toContain("activity-nested")
  })
})
