import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RoomHead } from "../../../../../src/browser/components/frame/screen-nav/room-head.tsx"
import type { TaskSummaryItem } from "../../../../../src/shared/repository/task-summary.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session/session-state.ts"
import { knownTaskSummary } from "../../../../fixture/session-state.ts"
import { queryClientWrapper } from "../../../query-client.tsx"
import { putSession, type SentCommand } from "../../../session-store.ts"

// Astryx の2つ切り替えの動きは Web Animations を使い、happy-dom は取り外しの cancel を未処理の拒否にする。cancel を何もしない形にして避ける。
beforeEach(() => {
  vi.spyOn(Animation.prototype, "cancel").mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.location.hash = ""
})

function renderRoomHead(state: Partial<SessionState>, spy: (command: SentCommand) => void): void {
  putSession({ ...INITIAL_SESSION_STATE, ...state }, spy)
  render(<RoomHead />, { wrapper: queryClientWrapper() })
}

function task(id: string, waitingFor: readonly string[]): TaskSummaryItem {
  return {
    id,
    summary: "架空のタスク",
    status: { kind: "known", status: "todo" },
    dependencies: waitingFor,
    waitingFor,
    labels: [],
    importance: "normal",
    urgency: "normal",
    body: "",
    location: { kind: "none" },
  }
}

describe("部屋の頭", () => {
  it("札は hash で紙を開くリンクで、タスクの札には着手できる件数を添える", () => {
    renderRoomHead(
      { tasks: knownTaskSummary([task("T-1", []), task("T-2", ["T-1"]), task("T-3", [])]) },
      () => {},
    )

    const nav = screen.getByRole("navigation", { name: "ほかの画面" })
    const links = within(nav).getAllByRole("link")
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["タスク 2", "#tasks"],
      ["成果", "#achievement"],
      ["キャラ", "#character"],
      ["設定", "#settings"],
    ])
    expect(screen.getByRole("link", { name: /^文脈/ }).getAttribute("href")).toBe("#token-usage")
  })

  it("開いている紙の札だけが aria-current を持つ", async () => {
    renderRoomHead({ tasks: { kind: "no-beads" } }, () => {})

    await act(async () => {
      window.location.hash = "#settings"
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(screen.getByRole("link", { name: "設定" }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("link", { name: "成果" }).getAttribute("aria-current")).toBeNull()
    expect(screen.queryByRole("link", { name: /^タスク/ })).toBeNull()
  })

  it("雑談を選ぶと session.setChatMode を送り、表示はサーバの値のまま", () => {
    const calls: SentCommand[] = []
    renderRoomHead({ chatMode: false }, (command) => {
      calls.push(command)
    })

    fireEvent.click(screen.getByRole("radio", { name: "雑談" }))

    expect(calls).toEqual([{ procedure: "session.setChatMode", chat: true }])
    expect(screen.getByRole("radio", { name: "仕事" }).getAttribute("aria-checked")).toBe("true")
  })
})

describe("探す", () => {
  it("⌘K で開き、字で絞って ↑ ↓ と Enter で選ぶと、その画面の紙を開いて閉じる", async () => {
    renderRoomHead({ tasks: { kind: "no-beads" } }, () => {})

    fireEvent.keyDown(document, { key: "k", metaKey: true })
    const field = screen.getByRole("combobox", { name: "探す", hidden: true })
    fireEvent.change(field, { target: { value: "設定" } })
    expect(
      screen.getAllByRole("option", { hidden: true }).map((option) => option.textContent),
    ).toEqual(["設定"])
    fireEvent.keyDown(field, { key: "ArrowDown" })
    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(window.location.hash).toBe("#settings")
    expect(screen.queryByRole("combobox", { name: "探す", hidden: true })).toBeNull()
  })

  it("頼めるタスクを選ぶと、タスクを進める依頼を送る", () => {
    const calls: SentCommand[] = []
    renderRoomHead(
      { tasks: knownTaskSummary([task("T-1", []), task("T-2", ["T-1"])]) },
      (command) => {
        calls.push(command)
      },
    )

    fireEvent.click(screen.getByRole("button", { name: /^探す/ }))
    const field = screen.getByRole("combobox", { name: "探す", hidden: true })
    fireEvent.change(field, { target: { value: "T-" } })
    expect(
      screen.getAllByRole("option", { hidden: true }).map((option) => option.textContent),
    ).toEqual(["T-1 架空のタスク↩ で頼む"])
    fireEvent.keyDown(field, { key: "Enter" })

    expect(calls).toEqual([
      { procedure: "session.prompt", text: "タスク T-1 を進めて。", images: [] },
    ])
  })
})
