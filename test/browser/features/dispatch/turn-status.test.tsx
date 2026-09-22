import { afterEach, describe, expect, it, spyOn } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { TurnStatus } from "../../../../src/browser/features/dispatch/turn-status.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/shared/session-state.ts"
import { type CommandSpy, sessionStoreWith } from "../../session-store.ts"

afterEach(() => {
  cleanup()
})

function renderTurnStatus(
  stateOverrides: Partial<SessionState>,
  dispatch: CommandSpy = () => {},
): void {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, ...stateOverrides }, dispatch)
  render(
    <SessionStoreContext.Provider value={store}>
      <TurnStatus />
    </SessionStoreContext.Provider>,
  )
}

describe("TurnStatus", () => {
  it("(4) ターンが進行中のときボタンが「中断」になり、押すと interrupt が dispatch される", () => {
    const calls: unknown[] = []
    renderTurnStatus({ turn: { kind: "running", startedAt: 0 } }, (command) => calls.push(command))

    const button = screen.getByRole("button")
    expect(button.textContent).toBe("中断")

    fireEvent.click(button)

    expect(calls).toEqual([{ type: "interrupt" }])
  })

  it("ターンが進行中でないときボタンは「送信」（type=submit で dispatch は直接呼ばない）", () => {
    const calls: unknown[] = []
    renderTurnStatus({ turn: { kind: "idle" } }, (command) => calls.push(command))

    const button = screen.getByRole("button") as HTMLButtonElement
    expect(button.textContent).toBe("送信")
    expect(button.type).toBe("submit")

    fireEvent.click(button)

    expect(calls).toEqual([])
  })

  it("(5) 経過時間は running の起点から数え、ラベルは「経過」（進行中）", () => {
    const now = 1_700_000_010_000
    const clock = spyOn(Temporal.Now, "instant").mockReturnValue(
      Temporal.Instant.fromEpochMilliseconds(now),
    )
    try {
      renderTurnStatus({ turn: { kind: "running", startedAt: now - 5_000 } })

      expect(screen.getByText("経過")).toBeDefined()
      expect(screen.getByText("5秒")).toBeDefined()
    } finally {
      clock.mockRestore()
    }
  })

  it("(5) finished になると経過時間が止まり、ラベルが「所要」に変わる", () => {
    renderTurnStatus({ turn: { kind: "finished", startedAt: 0, finishedAt: 125_000 } })

    expect(screen.getByText("所要")).toBeDefined()
    expect(screen.getByText("2分05秒")).toBeDefined()
  })

  it("始まった時刻と終わった時刻が同じなら 0秒（60秒未満は N秒 の形）", () => {
    renderTurnStatus({ turn: { kind: "finished", startedAt: 500, finishedAt: 500 } })

    expect(screen.getByText("0秒")).toBeDefined()
  })

  it("まだ依頼が無いとき（idle）は「-」を出す", () => {
    renderTurnStatus({ turn: { kind: "idle" } })

    expect(screen.getByText("-")).toBeDefined()
  })
})
