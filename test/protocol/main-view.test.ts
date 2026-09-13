import { describe, expect, it } from "bun:test"

import {
  MAX_MAIN_VIEW_TURNS,
  mainViewTurns,
  toolVisibility,
  type MainViewToolRun,
} from "../../src/protocol/main-view.ts"
import { type MainViewEntry } from "../../src/protocol/session-state.ts"

const request = (text: string): MainViewEntry => ({ kind: "request", text })
const detail = (markdown: string): MainViewEntry => ({ kind: "detail", markdown })
const edit = (path: string): MainViewEntry => ({
  kind: "tool",
  name: "Edit",
  input: { file_path: path },
  result: { content: "ok", isError: false },
})

describe("mainViewTurns（依頼で区切り、直近3件に絞る）", () => {
  it("依頼を境目にやり取りへ分ける", () => {
    const turns = mainViewTurns([
      request("前の依頼"),
      detail("前のレポート"),
      request("今回の依頼"),
      detail("今回のレポート"),
    ])

    expect(turns.map((turn) => turn.request)).toEqual(["前の依頼", "今回の依頼"])
    expect(turns[0]?.steps[0]?.report).toBe("前のレポート")
    expect(turns[1]?.steps[0]?.report).toBe("今回のレポート")
  })

  it("直近3件（今回・1つ前・2つ前）だけを昇順で残す", () => {
    const entries = Array.from({ length: 8 }, (_, index) => [
      request(`依頼${String(index)}`),
      detail(`レポート${String(index)}`),
    ]).flat()

    const turns = mainViewTurns(entries)

    expect(turns).toHaveLength(MAX_MAIN_VIEW_TURNS)
    expect(turns.map((turn) => turn.request)).toEqual(["依頼5", "依頼6", "依頼7"])
  })

  it("レポートとその後のツールの実行が1つのステップにまとまる", () => {
    const turns = mainViewTurns([
      request("依頼"),
      detail("まず読むね"),
      edit("src/a.ts"),
      detail("次に直すね"),
      edit("src/b.ts"),
    ])

    const steps = turns[0]?.steps ?? []
    expect(steps).toHaveLength(2)
    expect(steps[0]?.report).toBe("まず読むね")
    expect(steps[0]?.actions).toHaveLength(1)
    expect(steps[1]?.report).toBe("次に直すね")
  })

  it("レポートより前に実行されたツールは、レポートを持たないステップになる", () => {
    const turns = mainViewTurns([request("依頼"), edit("src/first.ts"), detail("あとから説明")])

    const steps = turns[0]?.steps ?? []
    expect(steps).toHaveLength(2)
    expect(steps[0]?.report).toBeUndefined()
    expect(steps[1]?.report).toBe("あとから説明")
  })

  it("1つのやり取りの記録が上限を超えたら、古いほうから落として件数を残す", () => {
    const entries = [
      request("依頼"),
      ...Array.from({ length: 45 }, (_, index) => detail(`レポート${String(index)}`)),
    ]

    const turns = mainViewTurns(entries)

    expect(turns[0]?.droppedCount).toBeGreaterThan(0)
    expect(turns[0]?.steps.at(-1)?.report).toBe("レポート44")
    expect(turns[0]?.steps[0]?.report).not.toBe("レポート0")
  })

  it("最初の依頼より前の記録も、request 無しのターンとして残す", () => {
    const turns = mainViewTurns([detail("依頼より前のレポート"), request("依頼"), detail("今回")])

    expect(turns).toHaveLength(2)
    expect(turns[0]?.request).toBeUndefined()
    expect(turns[0]?.steps[0]?.report).toBe("依頼より前のレポート")
  })
})

describe("toolVisibility（見せてよい3種だけを選ぶ）", () => {
  function tool(overrides: Partial<MainViewToolRun>): MainViewToolRun {
    return {
      kind: "tool",
      name: "Read",
      input: {},
      result: { content: "ok", isError: false },
      ...overrides,
    }
  }

  it("ファイルを変えた操作（Write/Edit/NotebookEdit）はパス込みで file-change になる", () => {
    const visibility = toolVisibility(tool({ name: "Edit", input: { file_path: "src/a.ts" } }))
    expect(visibility).toEqual({ kind: "file-change", path: "src/a.ts" })
  })

  it("読み取り・検索など未知のツール名は hidden になる", () => {
    expect(toolVisibility(tool({ name: "Read" }))).toEqual({ kind: "hidden" })
    expect(toolVisibility(tool({ name: "Grep" }))).toEqual({ kind: "hidden" })
  })

  it("失敗したツールは種類によらず failed になる", () => {
    const visibility = toolVisibility(
      tool({ name: "Read", result: { content: "エラー", isError: true } }),
    )
    expect(visibility).toEqual({ kind: "failed" })
  })

  it("サブエージェントの起動は description 込みで agent-launch になる", () => {
    const visibility = toolVisibility(tool({ name: "Agent", input: { description: "調査タスク" } }))
    expect(visibility).toEqual({ kind: "agent-launch", description: "調査タスク" })
  })

  it("file_path / description が無い（壊れた入力）ときは undefined を持たせて種類は保つ", () => {
    expect(toolVisibility(tool({ name: "Edit", input: {} }))).toEqual({
      kind: "file-change",
      path: undefined,
    })
    expect(toolVisibility(tool({ name: "Agent", input: {} }))).toEqual({
      kind: "agent-launch",
      description: undefined,
    })
  })
})
