import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import { Activity } from "../../../../src/browser/features/sidebar/activity.tsx"
import { type ToolActivity } from "../../../../src/shared/session-state.ts"

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
    failureOutput: undefined,
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

  it("失敗した回は「失敗」の文字が付き、色だけに頼らない", () => {
    render(
      <Activity
        running={[]}
        finished={[activity({ toolUseId: "toolu_1", failureOutput: "架空のエラー出力" })]}
      />,
    )

    expect(screen.getByRole("listitem").className).toContain("activity-failed")
    expect(screen.getByText("失敗")).toBeDefined()
  })

  it("失敗した回は引数と出力を開いて読める（レポートには出さないため）", () => {
    const { container } = render(
      <Activity
        running={[]}
        finished={[
          activity({
            toolUseId: "toolu_1",
            input: { command: "架空のコマンド" },
            failureOutput: "架空のエラー出力",
          }),
        ]}
      />,
    )

    expect(container.querySelector("details.activity-failure")).toBeDefined()
    expect(container.querySelector("pre.activity-failure-input")?.textContent).toContain(
      "架空のコマンド",
    )
    expect(container.querySelector("pre.activity-failure-output")?.textContent).toContain(
      "架空のエラー出力",
    )
  })

  it("成功した回は畳む器を作らない", () => {
    const { container } = render(
      <Activity running={[]} finished={[activity({ toolUseId: "toolu_1" })]} />,
    )

    expect(container.querySelector("details")).toBeNull()
    expect(screen.getByRole("listitem").className).not.toContain("activity-failed")
  })
})
