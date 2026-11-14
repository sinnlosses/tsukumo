import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  RoomHead,
  RoomHeadScope,
  RoomNarrowHead,
  RoomSidebarGates,
  RoomSidebarSearch,
} from "../../../../../src/browser/components/frame/screen-nav/room-head.tsx"
import type { TaskSummaryItem } from "../../../../../src/shared/repository/task-summary.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session/session-state.ts"
import { knownTaskSummary } from "../../../../fixture/session-state.ts"
import { queryClientWrapper } from "../../../query-client.tsx"
import { putSession, type SentCommand } from "../../../session-store.ts"

const macPlatform = vi.hoisted(() => ({ isMac: true }))
vi.mock("../../../../../src/browser/utils/primary-shortcut.ts", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isMacPlatform: () => macPlatform.isMac,
}))

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
  render(
    <RoomHeadScope>
      <RoomHead />
      <RoomSidebarSearch />
      <RoomSidebarGates />
    </RoomHeadScope>,
    { wrapper: queryClientWrapper() },
  )
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
  it("札は hash で紙を開くリンクで、タスクの札は出さない（紙の入口は探すにある）", () => {
    renderRoomHead(
      { tasks: knownTaskSummary([task("T-1", []), task("T-2", ["T-1"]), task("T-3", [])]) },
      () => {},
    )

    const nav = screen.getByRole("navigation", { name: "ほかの画面" })
    const links = within(nav).getAllByRole("link")
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["文脈 —", "#token-usage"],
      ["成果", "#achievement"],
      ["キャラ", "#character"],
      ["設定", "#settings"],
    ])
    expect(screen.getByRole("link", { name: /^文脈/ }).getAttribute("href")).toBe("#token-usage")
  })

  it("入口はサイドバーの入口の行にあり、左の群には仕事と雑談・状態だけが残り、部屋の名前はサイドバーの頭にある", () => {
    renderRoomHead({ tasks: { kind: "no-beads" } }, () => {})

    const count = (selector: string): number => document.querySelectorAll(selector).length
    expect(count('[data-region="room-head"] a')).toBe(0)
    expect(count('[data-region="room-head"] button:not([role="radio"])')).toBe(0)
    expect(count('[data-region="room-head"] [role="radio"]')).toBe(2)
    expect(
      within(screen.getByRole("navigation", { name: "ほかの画面" })).getAllByRole("link"),
    ).toHaveLength(4)
    const [title] = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("role") !== "radio")
    expect(title?.getAttribute("aria-haspopup")).toBe("dialog")
    expect(title?.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(title ?? document.body)
    expect(title?.getAttribute("aria-expanded")).toBe("true")
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

describe("サイドバーの入口", () => {
  it("検索の入口を押すと探すが開き、入口の行には文脈と3つの紙の <a> が並ぶ", () => {
    putSession({ ...INITIAL_SESSION_STATE, tasks: { kind: "no-beads" } }, () => {})
    render(
      <RoomHeadScope>
        <RoomSidebarSearch />
        <RoomSidebarGates />
      </RoomHeadScope>,
      { wrapper: queryClientWrapper() },
    )

    const links = within(screen.getByRole("navigation", { name: "ほかの画面" })).getAllByRole(
      "link",
    )
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#token-usage",
      "#achievement",
      "#character",
      "#settings",
    ])

    const search = screen.getByRole("button", { name: /^検索/ })
    expect(search.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(search)
    expect(search.getAttribute("aria-expanded")).toBe("true")
  })
})

describe("狭い幅の頭", () => {
  function renderNarrowHead(
    state: Partial<SessionState>,
    subject: { readonly kind: "room" } | { readonly kind: "turn"; readonly title: string },
  ): void {
    putSession({ ...INITIAL_SESSION_STATE, ...state }, () => {})
    render(
      <RoomHeadScope>
        <RoomNarrowHead subject={subject} />
      </RoomHeadScope>,
      { wrapper: queryClientWrapper() },
    )
  }

  it("状態とやり取りの題を出し、「≡」で探すを開くと「移る」の群から紙と切り替えへ移れる", async () => {
    renderNarrowHead(
      { tasks: knownTaskSummary([task("T-1", [])]) },
      {
        kind: "turn",
        title: "架空の依頼の題",
      },
    )

    const head = screen.getByRole("banner")
    expect(head.querySelector("b")?.textContent).toBe("架空の依頼の題")
    expect(head.querySelector("[data-state]")?.textContent).not.toBe("")

    const menu = screen.getByRole("button", { name: "メニューと探す" })
    fireEvent.click(menu)
    expect(menu.getAttribute("aria-expanded")).toBe("true")
    const options = screen
      .getAllByRole("option", { hidden: true })
      .map((option) => option.textContent ?? "")
    expect(options.slice(0, 7)).toEqual([
      "タスク",
      "成果",
      "使用量",
      "キャラクター",
      "設定",
      "雑談に切り替える",
      "セッションを切り替える",
    ])

    const field = screen.getByRole("combobox", { name: "探す", hidden: true })
    fireEvent.change(field, { target: { value: "設定" } })
    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(window.location.hash).toBe("#settings")
  })

  it("部屋が題のときは、サイドバーの頭の部屋の名前と同じ主の字を出す", () => {
    putSession({ ...INITIAL_SESSION_STATE, tasks: { kind: "no-beads" } }, () => {})
    render(
      <RoomHeadScope>
        <RoomSidebarSearch />
        <RoomNarrowHead subject={{ kind: "room" }} />
      </RoomHeadScope>,
      { wrapper: queryClientWrapper() },
    )

    const narrowTitle = document.querySelector('[data-region="room-narrow-head"] b')?.textContent
    expect(narrowTitle).not.toBe("")
    expect(document.querySelector("button[aria-haspopup]")?.textContent).toContain(narrowTitle)
  })
})

describe("探す", () => {
  it("⌘K で開き、字で絞って ↑ ↓ と Enter で選ぶと、その画面の紙を開いて閉じる", async () => {
    renderRoomHead({ tasks: { kind: "no-beads" } }, () => {})

    fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true })
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

  it("Mac では Ctrl+K と変換中の ⌘K で開かず、Mac 以外では Ctrl+K で開く", () => {
    renderRoomHead({ tasks: { kind: "no-beads" } }, () => {})
    const isOpen = (): boolean =>
      screen.queryByRole("combobox", { name: "探す", hidden: true }) !== null

    fireEvent.keyDown(document, { key: "k", code: "KeyK", ctrlKey: true })
    expect(isOpen()).toBe(false)
    fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true, isComposing: true })
    expect(isOpen()).toBe(false)

    macPlatform.isMac = false
    try {
      fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true })
      expect(isOpen()).toBe(false)
      fireEvent.keyDown(document, { key: "k", code: "KeyK", ctrlKey: true })
      expect(isOpen()).toBe(true)
    } finally {
      macPlatform.isMac = true
    }
  })

  it("頼めるタスクを選ぶと、タスクを進める依頼を送る", () => {
    const calls: SentCommand[] = []
    renderRoomHead(
      { tasks: knownTaskSummary([task("T-1", []), task("T-2", ["T-1"])]) },
      (command) => {
        calls.push(command)
      },
    )

    fireEvent.click(screen.getByRole("button", { name: /^検索/ }))
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
