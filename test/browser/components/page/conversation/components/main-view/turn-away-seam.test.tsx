import { cleanup, render, screen } from "@testing-library/react"
import { act } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { Turn } from "../../../../../../../src/browser/components/page/conversation/components/main-view/turn.tsx"
import { useAwaySeam } from "../../../../../../../src/browser/components/page/conversation/stores/away-seam.ts"
import { useSession } from "../../../../../../../src/browser/stores/session.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { requestRecord, speechRecord } from "../../../../../../fixture/session-record.ts"
import { TURN_ID, turn } from "../../../../../../fixture/turn.ts"
import { putSession } from "../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  act(() => {
    useAwaySeam.setState({ hidden: undefined, away: undefined })
  })
})

function renderTurn(): void {
  putSession({
    ...INITIAL_SESSION_STATE,
    records: [
      requestRecord({ turnId: TURN_ID }),
      speechRecord({ text: "見た行" }),
      speechRecord({ text: "新しい行" }),
    ],
  })
  render(<Turn turn={turn([])} newest freshReport={false} />)
}

function awayOf(turnId: number, rowCount: number) {
  return { generation: useSession.getState().generation, turnId, rowCount, awayMs: 4 * 60_000 }
}

describe("Turn の離れていたあいだの線", () => {
  it("前に見た位置より後ろの最初の行の手前に、1本だけ出る", () => {
    renderTurn()
    act(() => {
      useAwaySeam.setState({ away: awayOf(TURN_ID, 2) })
    })

    const seam = screen.getByRole("separator")
    expect(seam.textContent).toBe("ここから新しい離れていた 4分")
    expect(seam.nextElementSibling?.textContent).toContain("新しい行")
  })

  it("別のやり取りの線は出ない", () => {
    renderTurn()
    act(() => {
      useAwaySeam.setState({ away: awayOf(TURN_ID + 1, 2) })
    })

    expect(screen.queryByRole("separator")).toBeNull()
  })

  it("線を外すと消える", () => {
    renderTurn()
    act(() => {
      useAwaySeam.setState({ away: awayOf(TURN_ID, 2) })
    })
    act(() => {
      useAwaySeam.getState().dismiss()
    })

    expect(screen.queryByRole("separator")).toBeNull()
  })

  it("新しい行が無ければ出ない", () => {
    renderTurn()
    act(() => {
      useAwaySeam.setState({ away: awayOf(TURN_ID, 3) })
    })

    expect(screen.queryByRole("separator")).toBeNull()
  })
})
