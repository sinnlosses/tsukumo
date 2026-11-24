import { describe, expect, it } from "vitest"

import {
  columnHeadsOf,
  stageColumnsOf,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/workflow-diagram-placement.ts"
import type {
  WorkflowDiagram,
  WorkflowDiagramColumn,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/workflow-diagram.ts"

const agents = (key: string, spanKeys: readonly string[]): WorkflowDiagramColumn => ({
  kind: "agents",
  key,
  name: `${key}の名前`,
  current: false,
  spanKeys,
  boxes: [],
})
const upcoming = (key: string): WorkflowDiagramColumn => ({ kind: "upcoming", key, name: key })
const diagramOf = (columns: readonly WorkflowDiagramColumn[]): WorkflowDiagram => ({
  columns,
  arrows: [],
})

describe("stageColumnsOf", () => {
  const diagram = diagramOf([agents("a", ["a", "b"]), upcoming("c"), upcoming("d")])

  it("列の開始位置は先頭に譲った列と前の列の受け持つ段の数で決まる", () => {
    const columns = stageColumnsOf(diagram, { leadCount: 1, finished: false })
    expect(columns.map((column) => column.start)).toEqual([2, 4, 5])
  })

  it("送り出しの箱は鍵が合う「これから」の列にだけ載り、依頼が済んだ最後の列だけが印を持つ", () => {
    const columns = stageColumnsOf(diagram, {
      leadCount: 0,
      finished: true,
      landingKey: "c",
      landing: "箱",
    })
    expect(columns.map((column) => column.body)).toEqual(["agents", "landing", "upcoming"])
    expect(columns.map((column) => column.reachedEnd)).toEqual([false, false, true])
    expect(columns.map((column) => column.upcomingNote)).toEqual(["済み", "済み", "済み"])
  })

  it("選んだエージェントの index だけを持ち、メインの着手の箱を選んでいるときは持たない", () => {
    const withAgent = stageColumnsOf(diagram, {
      leadCount: 0,
      finished: false,
      selected: { kind: "agent", index: 3 },
    })
    const withPrelude = stageColumnsOf(diagram, {
      leadCount: 0,
      finished: false,
      selected: { kind: "prelude" },
    })
    expect(withAgent[0]?.selectedIndex).toBe(3)
    expect(withPrelude[0]).not.toHaveProperty("selectedIndex")
  })
})

describe("columnHeadsOf", () => {
  const stage = (current: boolean) => {
    const column = agents("a", ["a", "b", "c"])
    return { column, keys: ["a", "b", "c"], start: 2, current }
  }
  const durations = new Map([["b", "3 分"]])

  it("先頭の見出しだけ列の名前で、残りは段の鍵と所要を出す", () => {
    expect(columnHeadsOf(stage(false), durations)).toEqual([
      { key: "a", name: "aの名前", start: 2, current: false, duration: "" },
      { key: "b", name: "b", start: 3, current: false, duration: "3 分" },
      { key: "c", name: "c", start: 4, current: false, duration: "" },
    ])
  })

  it("計画の今の段がこの列にあればその段の見出しが今で、無ければ今の列の先頭が今", () => {
    expect(columnHeadsOf(stage(false), durations, "c").map((head) => head.current)).toEqual([
      false,
      false,
      true,
    ])
    expect(columnHeadsOf(stage(true), durations).map((head) => head.current)).toEqual([
      true,
      false,
      false,
    ])
  })
})
