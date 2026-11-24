import { fireEvent, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { FRAME_ERROR_REASON } from "../../../../../src/shared/frame-error-reason.ts"
import type { SessionState } from "../../../../../src/shared/session/session-state.ts"
import {
  FIXTURE_PENDING,
  renderScreenNav,
  useScreenNavHarness,
} from "../../../screen-nav-harness.tsx"

useScreenNavHarness()

describe("ScreenNav の仕事・雑談の門", () => {
  function gate(name: string): HTMLElement {
    return screen.getByRole("link", { name: new RegExp(`^${name}`) })
  }

  // 帯の操作子が送るコマンドは、いままでサイドバーの <select> が送っていたものと同じ
  // （`session.setChatMode`。docs/architecture/screen-design.md「画面のナビゲーション」）。
  it("違うモードの門を押すと session.setChatMode を送る", () => {
    const calls: unknown[] = []
    renderScreenNav({ chatMode: false }, (command) => {
      calls.push(command)
    })

    fireEvent.click(gate("雑談"))

    expect(calls).toEqual([{ procedure: "session.setChatMode", chat: true }])
  })

  it("同じモードの門を押しても何も送らない", () => {
    const calls: unknown[] = []
    renderScreenNav({ chatMode: false }, (command) => {
      calls.push(command)
    })

    fireEvent.click(gate("仕事"))

    expect(calls).toEqual([])
  })

  it("いまの印はサーバから届いたモードの門にだけ付き、押した側へ先には倒れない", () => {
    renderScreenNav({ chatMode: false })

    fireEvent.click(gate("雑談"))

    expect(gate("仕事").getAttribute("aria-current")).toBe("page")
    expect(gate("雑談").getAttribute("aria-current")).toBeNull()
  })

  it("ターン進行中は違うモードの門が aria-disabled になり、title に理由が出て、押しても送らない", () => {
    const calls: unknown[] = []
    renderScreenNav({ chatMode: false, turn: { kind: "running", startedAt: 0 } }, (command) => {
      calls.push(command)
    })

    const chatGate = gate("雑談")
    expect(chatGate.getAttribute("aria-disabled")).toBe("true")
    expect(chatGate.getAttribute("title")).toBe(FRAME_ERROR_REASON.chatModeSwitchDuringTurn)
    expect(gate("仕事").getAttribute("aria-disabled")).toBeNull()
    fireEvent.click(chatGate)

    expect(calls).toEqual([])
  })

  it("会話以外の画面にいるあいだは、戻り先のモードの門にだけ印が付く", () => {
    window.location.hash = "#character"
    renderScreenNav({ chatMode: true })

    expect(gate("雑談").className).toContain("has-return-mark")
    expect(gate("仕事").className).not.toContain("has-return-mark")
    expect(gate("キャラ").getAttribute("aria-current")).toBe("page")
    expect(gate("雑談").getAttribute("aria-current")).toBeNull()
  })

  it.each([
    ["依頼待ち", "idle", {}],
    ["作業中", "working", { turn: { kind: "running", startedAt: 0 } }],
    ["答え待ち", "pending", { pending: [FIXTURE_PENDING] }],
    ["止まっている", "stopped", { endedReason: "架空の終了理由" }],
  ] as const satisfies readonly (readonly [string, string, Partial<SessionState>])[])(
    "戻り先の門の名前とツールチップに状態の語（%s）が入り、点の色の種類が %s になる",
    (word, tone, state) => {
      window.location.hash = "#character"
      renderScreenNav({ chatMode: false, ...state })

      const returnGate = screen.getByRole("link", { name: `仕事（${word}）` })
      expect(returnGate.getAttribute("title")).toBe(`仕事（${word}）`)
      expect(returnGate.getAttribute("data-return-tone")).toBe(tone)
    },
  )

  it("会話以外の画面では、戻り先でない門に状態の語も点の色も付かない", () => {
    window.location.hash = "#character"
    renderScreenNav({ chatMode: false })

    const other = screen.getByRole("link", { name: "雑談" })
    expect(other.getAttribute("data-return-tone")).toBeNull()
    expect(other.getAttribute("title")).toBeNull()
  })

  it("会話の画面では戻り先の印を付けず、モードの門がいまの印を持つ", () => {
    renderScreenNav({ chatMode: true })

    expect(gate("雑談").className).not.toContain("has-return-mark")
    expect(gate("雑談").getAttribute("aria-current")).toBe("page")
  })
})
