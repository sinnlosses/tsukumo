// 帯の左上の札と、押すと開く切り替え画面（`docs/architecture/screen-design.md`「セッションの札」
// 「切り替え画面」）。操作の流れ（札を押す → ↓ → Enter）は E2E も守る。ここで見るのは
// E2E が凍らせた時計では見えない日の区切りと、送るコマンドの分かれ目。
//

import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ScreenNav } from "../../../../../src/browser/components/domain/screen-nav/screen-nav.tsx"
import { useNavDrawer } from "../../../../../src/browser/stores/nav-drawer.ts"
import type { SessionChoice } from "../../../../../src/shared/session/session-choice.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session/session-state.ts"
import { setPageUrl } from "../../../../dom-environment.ts"
import { EMPTY_NAV_DRAWER_SLOTS } from "../../../nav-drawer-slot.tsx"
import { createTestQueryClient } from "../../../query-client.tsx"
import { rpcOutput, stubRpcFetch, type RpcFetchStub } from "../../../rpc-fetch-stub.ts"
import { type CommandSpy, putSession, type SentCommand } from "../../../session-store.ts"

let fetchStub: RpcFetchStub | undefined = undefined

afterEach(() => {
  cleanup()
  useNavDrawer.setState(useNavDrawer.getInitialState(), true)
  fetchStub?.restore()
  fetchStub = undefined
  setPageUrl("http://127.0.0.1/")
})

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

function session(sessionId: string, heading: string, ageMs: number): SessionChoice {
  const lastModified = Temporal.Now.instant().epochMilliseconds - ageMs
  return { viewPort: 7327, sessionId, lastModified, startedAt: lastModified - HOUR_MS, heading }
}

const SESSIONS: readonly SessionChoice[] = [
  session("fa000000-0000", "架空のいまの作業", 0),
  session("7b000000-0000", "架空の昨日の作業 課題101", DAY_MS),
  session("c3000000-0000", "架空の古い作業", 5 * DAY_MS),
]

function renderNav(state: Partial<SessionState>, spy: CommandSpy = () => {}): void {
  setPageUrl("http://127.0.0.1:7327/")
  fetchStub = stubRpcFetch((call) =>
    call.procedure === "repository/projectName"
      ? rpcOutput("fictional-project")
      : rpcOutput({
          kind: "known",
          requestCount: 4,
          summary: "架空の要約の一段落目。\n\n残り：架空の残り。",
          lastLine: "架空の締めのセリフ",
        }),
  )
  putSession(
    {
      ...INITIAL_SESSION_STATE,
      session: { kind: "identified", sessionId: "fa000000-0000" },
      sessions: SESSIONS,
      ...state,
    },
    spy,
  )
  const client = createTestQueryClient()
  render(
    <QueryClientProvider client={client}>
      <ScreenNav drawer={EMPTY_NAV_DRAWER_SLOTS} />
    </QueryClientProvider>,
  )
}

function switcherOpen(): boolean {
  return (
    screen.queryByRole("dialog", { name: "セッションを切り替える" })?.hasAttribute("open") === true
  )
}

function openByTag(): void {
  const [tag] = screen.getAllByRole("button", { name: /セッション FA。/u })
  if (tag === undefined) {
    throw new Error("札が無い")
  }
  fireEvent.click(tag)
}

/** 切り替え画面の一覧（帯の `<select>` の選択肢と混ざらないよう、ここに絞って引く）。 */
function sessionList(): HTMLElement {
  return screen.getByRole("listbox", { name: "セッション" })
}

function searchBox(): HTMLElement {
  return screen.getByRole("combobox", { name: "セッションを探す" })
}

describe("セッションの札と切り替え画面", () => {
  it("押せるのは短縮IDだけで、部屋の名前はボタンの外に出る", () => {
    renderNav({})
    const [tag] = screen.getAllByRole("button", { name: /セッション FA。/u })
    if (tag === undefined) {
      throw new Error("札が無い")
    }

    expect(tag.textContent).toBe("FA")
    fireEvent.pointerEnter(tag)
    expect(screen.getByRole("tooltip").textContent).toContain("セッション FA")
  })

  it("札で開くと、選んでいるセッションの要約と最後のひとことが右の欄に出る", async () => {
    renderNav({})
    openByTag()

    expect(await screen.findByText(/架空の要約の一段落目。/u)).toBeDefined()
    expect(await screen.findByText(/架空の締めのセリフ/u)).toBeDefined()
  })

  // 切り替え画面は引き出しの上に重なって開く（引き出しは閉じない）。
  it("引き出しの名乗りの行の短縮IDからも、同じ切り替え画面が開く", () => {
    renderNav({})
    fireEvent.click(screen.getByRole("button", { name: "やり取りとタスクを開く" }))
    const drawer = screen.getByRole("dialog", { name: "引き出し" })

    fireEvent.click(within(drawer).getByRole("button", { name: /セッション FA。/u }))

    expect(switcherOpen()).toBe(true)
    expect(useNavDrawer.getState().open).toBe(true)
  })

  it("一覧は今日・昨日・それより前に分かれ、いまの行に「いま」が付く", () => {
    renderNav({})
    openByTag()

    const groups = within(sessionList())
      .getAllByRole("group")
      .map((group) => group.getAttribute("aria-label"))
    expect(groups).toEqual(["今日", "昨日", "それより前"])
    const current = within(sessionList()).getByRole("option", { name: /架空のいまの作業/u })
    expect(current.textContent).toContain("いま")
  })

  it("Ctrl+N で下の行を選び Enter で switchSession を送り、閉じる", () => {
    const sent: SentCommand[] = []
    renderNav({}, (command) => sent.push(command))
    openByTag()

    fireEvent.keyDown(searchBox(), { key: "n", ctrlKey: true })
    fireEvent.keyDown(searchBox(), { key: "Enter" })

    expect(sent).toEqual([{ procedure: "session.switchSession", sessionId: "c3000000-0000" }])
    expect(switcherOpen()).toBe(false)
  })

  it.each([
    ["↑", { key: "ArrowUp" }],
    ["Ctrl+P", { key: "p", ctrlKey: true }],
  ])("%s でいま出しているセッションを選んで Enter しても送らない", (_name, key) => {
    const sent: SentCommand[] = []
    renderNav({}, (command) => sent.push(command))
    openByTag()

    fireEvent.keyDown(searchBox(), key)
    fireEvent.keyDown(searchBox(), { key: "Enter" })

    expect(sent).toEqual([])
  })

  it("探す欄は短縮IDと見出し（に書かれた番号）で絞る", () => {
    renderNav({})
    openByTag()

    fireEvent.change(searchBox(), { target: { value: "c3" } })
    expect(
      within(sessionList())
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([expect.stringContaining("架空の古い作業")])

    fireEvent.change(searchBox(), { target: { value: "課題101" } })
    expect(
      within(sessionList())
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([expect.stringContaining("架空の昨日の作業")])
  })

  it("「＋ 新しいセッション」で startNewSession を送る。ターン中は押せない", () => {
    const sent: SentCommand[] = []
    renderNav({}, (command) => sent.push(command))
    openByTag()
    fireEvent.click(screen.getByRole("button", { name: "＋ 新しいセッション" }))
    expect(sent).toEqual([{ procedure: "session.startNewSession" }])

    cleanup()
    renderNav({ turn: { kind: "running", startedAt: 0 } })
    openByTag()
    expect(
      screen.getByRole("button", { name: "＋ 新しいセッション" }).getAttribute("aria-disabled"),
    ).toBe("true")
  })
})
