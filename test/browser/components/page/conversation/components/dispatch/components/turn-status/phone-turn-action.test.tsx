import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { PhoneTurnAction } from "../../../../../../../../../src/browser/components/page/conversation/components/dispatch/components/turn-status/turn-status.tsx"
import { useComposerDraft } from "../../../../../../../../../src/browser/stores/composer-draft.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../../../src/shared/session/session-state.ts"
import { typedElement } from "../../../../../../../../typed-element.ts"
import { type CommandSpy, putSession } from "../../../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
})

function renderAction(
  stateOverrides: Partial<SessionState>,
  dispatch: CommandSpy = () => {},
): void {
  putSession({ ...INITIAL_SESSION_STATE, ...stateOverrides }, dispatch)
  render(<PhoneTurnAction />)
}

const RUNNING = { turn: { kind: "running", startedAt: 0 } } satisfies Partial<SessionState>

describe("PhoneTurnAction", () => {
  it("進行中は ■ で、押すと札が開き、「止める」で interrupt を1回送る", () => {
    const calls: unknown[] = []
    renderAction(RUNNING, (command) => calls.push(command))

    fireEvent.click(screen.getByRole("button", { name: "中断する" }))
    expect(calls).toEqual([])
    fireEvent.click(screen.getByRole("button", { name: "止める" }))

    expect(calls).toEqual([{ procedure: "session.interrupt" }])
    expect(screen.queryByRole("button", { name: "続ける" })).toBeNull()
  })

  it("「続ける」と Esc は何も送らず札を閉じる", () => {
    const calls: unknown[] = []
    renderAction(RUNNING, (command) => calls.push(command))

    fireEvent.click(screen.getByRole("button", { name: "中断する" }))
    fireEvent.click(screen.getByRole("button", { name: "続ける" }))
    expect(screen.queryByRole("button", { name: "止める" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "中断する" }))
    fireEvent.keyDown(screen.getByRole("button", { name: "続ける" }), { key: "Escape" })
    expect(screen.queryByRole("button", { name: "止める" })).toBeNull()
    expect(calls).toEqual([])
  })

  it("進行中でなければ ↑ で、打った字が無いあいだは押せず、打つと押せる", () => {
    renderAction({})
    const send = typedElement(screen.getByRole("button", { name: "送信" }), HTMLButtonElement, "↑")
    expect(send.type).toBe("submit")
    expect(send.disabled).toBe(true)
    expect(screen.queryByRole("button", { name: "中断する" })).toBeNull()

    act(() => {
      useComposerDraft.getState().setDraft({ text: "架空の依頼", caret: 5 })
    })

    expect(send.disabled).toBe(false)
  })

  it("背景のタスクだけが残っているときは ↑ のまま", () => {
    renderAction({
      turn: { kind: "finished", startedAt: 0, finishedAt: 1000, ending: { kind: "ended" } },
      backgroundTasks: [{ taskId: "task-1", kind: "agent", description: "架空の委譲" }],
    })

    expect(screen.getByRole("button", { name: "送信" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "中断する" })).toBeNull()
  })
})
