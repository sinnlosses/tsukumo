import { describe, expect, it } from "vitest"

import { sessionOutline } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/session-outline-row.ts"
import type { SessionSwitcherRow } from "../../../../../../../../src/browser/features/session-switcher/session-switcher-row.ts"
import { checkedSessionId } from "../../../../../../../fixture/session-id.ts"

function row(
  over: Partial<Omit<SessionSwitcherRow, "sessionId">> & { readonly sessionId: string },
): SessionSwitcherRow {
  return {
    shortId: "",
    heading: "架空の見出し",
    group: "today",
    timeLabel: "10:00",
    rangeLabel: "",
    current: false,
    worktree: "fictional-tree",
    inCurrentWorktree: true,
    occupiedElsewhere: false,
    ...over,
    sessionId: checkedSessionId(over.sessionId),
  }
}

describe("sessionOutline", () => {
  it("一覧に無いいまのセッションを、今日の先頭に最初の依頼の題で出して数える", () => {
    const { sections, count } = sessionOutline({
      rows: [row({ sessionId: "aa00-0001" }), row({ sessionId: "bb00-0001", group: "yesterday" })],
      currentSessionId: checkedSessionId("fa00-0001"),
      firstTurnTitle: "架空の依頼",
    })

    expect(sections.map((section) => [section.group, section.rows.map((r) => r.heading)])).toEqual([
      ["today", ["架空の依頼", "架空の見出し"]],
      ["yesterday", ["架空の見出し"]],
    ])
    expect(sections[0]?.rows[0]?.timeLabel).toBe("いま")
    expect(count).toBe(3)
  })

  it("一覧にあるいまのセッションは重ねず、その見出しで先頭に出す。ID が無いあいだは押せない行になる", () => {
    const listed = sessionOutline({
      rows: [row({ sessionId: "aa00-0001", current: true, heading: "架空の一覧の見出し" })],
      currentSessionId: checkedSessionId("aa00-0001"),
    })
    expect(listed.count).toBe(1)
    expect(listed.sections[0]?.rows[0]?.heading).toBe("架空の一覧の見出し")

    const starting = sessionOutline({ rows: [] })
    expect(starting.sections[0]?.rows[0]?.sessionId).toBeUndefined()
    expect(starting.sections[0]?.rows[0]?.heading).toBe("（題なし）")
  })

  it("それより前と、ほかの作業ツリーの行は出さない", () => {
    const { count } = sessionOutline({
      rows: [
        row({ sessionId: "aa00-0001", group: "earlier" }),
        row({ sessionId: "bb00-0001", inCurrentWorktree: false }),
      ],
    })

    expect(count).toBe(1)
  })
})
