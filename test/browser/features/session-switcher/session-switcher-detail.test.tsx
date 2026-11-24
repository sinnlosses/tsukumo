import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SessionSwitcherDetail } from "../../../../src/browser/features/session-switcher/session-switcher-detail.tsx"
import type { SessionSwitcherRow } from "../../../../src/browser/features/session-switcher/session-switcher-row.ts"
import type { SessionDigestView } from "../../../../src/browser/features/session-switcher/use-session-digest.ts"
import type { SessionId } from "../../../../src/shared/session/session-id.ts"
import { checkedSessionId } from "../../../fixture/session-id.ts"

afterEach(cleanup)

const SUMMARY_HEADING = "このセッションの要約"
const LAST_LINE_HEADING = "最後のひとこと"
const NO_SUMMARY = "要約はまだ無い（このセッションの report に要約が書かれていない）"
const REMAINING_LABEL = "残り："
const LOADING = "読み込み中…"
const UNAVAILABLE = "このセッションの記録は読めなかった"
const CURRENT_BUTTON = "いま出しているセッション"

function row(patch: Partial<SessionSwitcherRow> = {}): SessionSwitcherRow {
  return {
    sessionId: checkedSessionId("7b000000-0000"),
    shortId: "7B",
    heading: "架空の昨日の作業",
    group: "yesterday",
    timeLabel: "10:00",
    rangeLabel: "9/25 09:00 – 10:00",
    current: false,
    worktree: "fictional-tree",
    inCurrentWorktree: true,
    occupiedElsewhere: false,
    ...patch,
  }
}

function renderDetail(
  props: { row?: SessionSwitcherRow; showTitle?: boolean; blocked?: boolean },
  onSwitch: (sessionId: SessionId) => void = () => {},
): void {
  render(
    <SessionSwitcherDetail
      row={props.row ?? row()}
      digest={{ kind: "known", requestCount: 3, summary: "架空の要約。" }}
      characterName="架空の名前"
      face={null}
      showTitle={props.showTitle ?? false}
      blocked={props.blocked ?? false}
      onSwitch={onSwitch}
    />,
  )
}

function Detail(props: { digest: SessionDigestView }): ReactElement {
  return (
    <SessionSwitcherDetail
      row={row()}
      digest={props.digest}
      characterName="架空の名前"
      face={null}
      showTitle={false}
      blocked={false}
      onSwitch={() => {}}
    />
  )
}

describe("SessionSwitcherDetail", () => {
  it("読み込み中と読めなかったときは、その旨だけを出す", () => {
    const { rerender } = render(<Detail digest={{ kind: "loading" }} />)
    expect(screen.queryByText(LOADING)).not.toBeNull()

    rerender(<Detail digest={{ kind: "unavailable" }} />)
    expect(screen.queryByText(UNAVAILABLE)).not.toBeNull()
    expect(screen.queryByText(SUMMARY_HEADING)).toBeNull()
  })

  it("要約が無いときは理由を出し、残りと最後のひとことは有るものだけを出す", () => {
    const { rerender } = render(<Detail digest={{ kind: "known", requestCount: 1 }} />)
    expect(screen.queryByText(NO_SUMMARY)).not.toBeNull()
    expect(screen.queryByText(LAST_LINE_HEADING)).toBeNull()

    rerender(
      <Detail
        digest={{
          kind: "known",
          requestCount: 1,
          summary: "架空の要約。",
          remaining: "架空の残り。",
          lastLine: "架空の締め",
        }}
      />,
    )
    expect(screen.queryByText(`${REMAINING_LABEL}架空の残り。`)).not.toBeNull()
    expect(screen.queryByText(LAST_LINE_HEADING)).not.toBeNull()
  })

  it("showTitle が真なら題が出て、偽なら出ない", () => {
    renderDetail({ showTitle: true })
    expect(screen.queryByText("架空の昨日の作業")).not.toBeNull()

    cleanup()
    renderDetail({ showTitle: false })
    expect(screen.queryByText("架空の昨日の作業")).toBeNull()
  })

  it("切り替えるボタンは、そのセッションの ID を渡す", () => {
    const onSwitch = vi.fn<(sessionId: SessionId) => void>()
    renderDetail({}, onSwitch)

    fireEvent.click(screen.getByRole("button", { name: "7B に切り替える" }))

    expect(onSwitch).toHaveBeenCalledWith("7b000000-0000")
  })

  it("いまの行ではボタンが押せない", () => {
    renderDetail({ row: row({ current: true }) })

    const button = screen.getByRole("button", { name: CURRENT_BUTTON })

    expect(button.getAttribute("aria-disabled")).toBe("true")
  })

  it("blocked のあいだはボタンが押せない", () => {
    renderDetail({ blocked: true })

    const button = screen.getByRole("button", { name: "7B に切り替える" })

    expect(button.getAttribute("aria-disabled")).toBe("true")
  })
})
