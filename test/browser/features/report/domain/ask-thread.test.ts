import { describe, expect, it } from "vitest"

import {
  askLeafKey,
  drawnLeafKeys,
  groupAsks as groupSources,
} from "../../../../../src/browser/features/report/domain/ask-thread.ts"
import { replyTargetOf } from "../../../../../src/browser/features/report/domain/reply-target.ts"
import type { MainViewAside } from "../../../../../src/shared/session/main-view-shape.ts"
import { SETTLED } from "../../../../fixture/main-view-entry.ts"
import { ask, report, turnOf } from "../../../../fixture/main-view-report.ts"

const target = (
  reportToolUseId: string,
  componentId: string,
  row?: { index: number; firstCell: string },
) =>
  replyTargetOf({
    reportToolUseId,
    componentId,
    section: "架空の節",
    title: "架空の表",
    componentKind: "Table",
    ...(row === undefined ? {} : { row }),
  })

const waiting = (text: string, at?: ReturnType<typeof target>): MainViewAside => ({
  text,
  ...(at === undefined ? {} : { target: at }),
  answer: { kind: "waiting" },
})
const answered = (text: string, at?: ReturnType<typeof target>): MainViewAside => ({
  ...waiting(text, at),
  answer: { kind: "answered", text: "架空の答え" },
})

const groupAsks = (asides: readonly MainViewAside[], drawn: ReadonlySet<string>) =>
  groupSources(
    asides.map((aside) => ({ aside, own: true })),
    drawn,
  )

describe("groupAsks", () => {
  it("出しているやり取りの外の補足は、束には入るが親のカードには残らない", () => {
    const gone = waiting("問い", target("toolu_gone", "tbl"))
    const { byLeaf, remaining } = groupSources(
      [
        { aside: gone, own: false },
        { aside: waiting("別", target("toolu_a", "tbl")), own: false },
      ],
      new Set([askLeafKey("toolu_a", "tbl")]),
    )
    expect(byLeaf.get(askLeafKey("toolu_a", "tbl"))?.count).toBe(1)
    expect(remaining).toEqual([])
  })

  const drawn = new Set([askLeafKey("toolu_a", "tbl"), askLeafKey("toolu_a", "other")])

  it("答え待ちの補足は部品の束に入り、待ちの印が立つ", () => {
    const { byLeaf, remaining } = groupAsks([waiting("問い", target("toolu_a", "tbl"))], drawn)
    expect(byLeaf.get(askLeafKey("toolu_a", "tbl"))).toMatchObject({ waiting: true, count: 1 })
    expect(remaining).toEqual([])
  })

  it("答えた補足は待ちの印が立たない", () => {
    const { byLeaf } = groupAsks([answered("問い", target("toolu_a", "tbl"))], drawn)
    expect(byLeaf.get(askLeafKey("toolu_a", "tbl"))).toMatchObject({ waiting: false, count: 1 })
  })

  it("同じ部品への2つは古い順に並び、1つでも待ちなら待ち", () => {
    const at = target("toolu_a", "tbl")
    const { byLeaf } = groupAsks([answered("一", at), waiting("二", at)], drawn)
    const thread = byLeaf.get(askLeafKey("toolu_a", "tbl"))
    expect(thread?.pairs.map((pair) => pair.question)).toEqual(["一", "二"])
    expect(thread).toMatchObject({ waiting: true, count: 2 })
  })

  it("同じ部品の別の行は行の添字と字を持つ", () => {
    const { byLeaf } = groupAsks(
      [
        waiting("一", target("toolu_a", "tbl", { index: 0, firstCell: "甲" })),
        waiting("二", target("toolu_a", "tbl", { index: 2, firstCell: "乙" })),
      ],
      drawn,
    )
    expect(byLeaf.get(askLeafKey("toolu_a", "tbl"))?.pairs.map((pair) => pair.row)).toEqual([
      { index: 0, label: "甲" },
      { index: 2, label: "乙" },
    ])
  })

  it("別のやり取りのレポートの部品でも、画面にあれば束に入る", () => {
    const { byLeaf } = groupAsks(
      [answered("問い", target("toolu_a", "other"))],
      new Set([askLeafKey("toolu_a", "other")]),
    )
    expect([...byLeaf.keys()]).toEqual([askLeafKey("toolu_a", "other")])
  })

  it("鍵の部品が画面に無い補足は親のカードに残り、指した所の字が付く", () => {
    const { byLeaf, remaining } = groupAsks(
      [waiting("問い", target("toolu_gone", "tbl", { index: 1, firstCell: "甲" }))],
      drawn,
    )
    expect(byLeaf.size).toBe(0)
    expect(remaining.map((entry) => entry.pointed)).toEqual(["架空の表 甲"])
  })

  it("指した所の無い補足は親のカードに残り、字は付かない", () => {
    const { byLeaf, remaining } = groupAsks([waiting("問い")], drawn)
    expect(byLeaf.size).toBe(0)
    expect(remaining).toEqual([{ aside: waiting("問い") }])
  })
})

describe("drawnLeafKeys", () => {
  it("面に描かれたレポートの部品を、呼び出しの ID と部品の ID の対で数える", () => {
    const turn = turnOf([ask, report("架空の結論", "架空の本文。")], SETTLED, true)
    const keys = drawnLeafKeys(turn?.steps ?? [])
    expect(keys.size).toBeGreaterThan(0)
    expect([...keys].every((key) => key.startsWith("toolu_r1\u0000"))).toBe(true)
  })

  it("レポートの無いステップは数えない", () => {
    const turn = turnOf([ask], SETTLED, true)
    expect(drawnLeafKeys(turn?.steps ?? []).size).toBe(0)
  })
})
