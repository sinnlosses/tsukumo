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
  it("(4) turnInProgress のときボタンが「中断」になり、押すと interrupt が dispatch される", () => {
    const calls: unknown[] = []
    renderTurnStatus({ turnInProgress: true }, (command) => calls.push(command))

    const button = screen.getByRole("button")
    expect(button.textContent).toBe("中断")

    fireEvent.click(button)

    expect(calls).toEqual([{ type: "interrupt" }])
  })

  it("turnInProgress でないときボタンは「送信」（type=submit で dispatch は直接呼ばない）", () => {
    const calls: unknown[] = []
    renderTurnStatus({ turnInProgress: false }, (command) => calls.push(command))

    const button = screen.getByRole("button") as HTMLButtonElement
    expect(button.textContent).toBe("送信")
    expect(button.type).toBe("submit")

    fireEvent.click(button)

    expect(calls).toEqual([])
  })

  it("(5) 経過時間は turnStartedAt から数え、ラベルは「経過」（進行中）", () => {
    const now = 1_700_000_010_000
    const clock = spyOn(Temporal.Now, "instant").mockReturnValue(
      Temporal.Instant.fromEpochMilliseconds(now),
    )
    try {
      renderTurnStatus({
        turnInProgress: true,
        turnStartedAt: now - 5_000,
        turnFinishedAt: undefined,
      })

      expect(screen.getByText("経過")).toBeDefined()
      expect(screen.getByText("5秒")).toBeDefined()
    } finally {
      clock.mockRestore()
    }
  })

  it("(5) turnFinishedAt があると経過時間が止まり、ラベルが「所要」に変わる", () => {
    renderTurnStatus({
      turnInProgress: false,
      turnStartedAt: 0,
      turnFinishedAt: 125_000,
    })

    expect(screen.getByText("所要")).toBeDefined()
    expect(screen.getByText("2分05秒")).toBeDefined()
  })

  it("始まった時刻と終わった時刻が同じなら 0秒（60秒未満は N秒 の形）", () => {
    renderTurnStatus({ turnInProgress: false, turnStartedAt: 500, turnFinishedAt: 500 })

    expect(screen.getByText("0秒")).toBeDefined()
  })

  it("まだ依頼が無いとき（turnStartedAt が undefined）は「-」を出す", () => {
    renderTurnStatus({ turnStartedAt: undefined, turnFinishedAt: undefined })

    expect(screen.getByText("-")).toBeDefined()
  })
})
