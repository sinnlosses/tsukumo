import { act, cleanup, render, screen, within } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Layout } from "../../../../src/browser/components/app/layout.tsx"

// 名前を入れた部品は、描くときに throw する。
const failing = vi.hoisted(() => ({ names: new Set<string>() }))

function stubPart(name: string): () => ReactElement {
  return function StubPart(): ReactElement {
    if (failing.names.has(name)) {
      throw new Error(`${name} の描画の失敗（テスト用）`)
    }
    return <div data-testid={name} />
  }
}

vi.mock("../../../../src/browser/components/domain/screen-nav/screen-nav.tsx", () => ({
  ScreenNav: () => <nav aria-label="画面のナビ" />,
}))
vi.mock("../../../../src/browser/components/domain/skip-link.tsx", () => ({
  SkipLink: () => <div />,
}))
vi.mock(
  "../../../../src/browser/components/domain/sidebar/components/sidebar-task-pane.tsx",
  () => ({
    SidebarTaskPane: () => <div />,
  }),
)
vi.mock("../../../../src/browser/components/domain/sidebar/components/usage-pane.tsx", () => ({
  UsagePane: () => <div />,
}))
vi.mock("../../../../src/browser/features/run-setting/components/run-setting-group.tsx", () => ({
  RunSettingGroup: () => <div />,
}))
vi.mock(
  "../../../../src/browser/components/page/conversation/components/main-view/components/turn-list/turn-list.tsx",
  () => ({ TurnList: () => <div /> }),
)
vi.mock("../../../../src/browser/components/page/conversation/conversation.tsx", () => ({
  Conversation: () => stubPart("conversation")(),
}))
vi.mock(
  "../../../../src/browser/components/page/achievement/components/diary-notice/diary-notice.tsx",
  () => ({ DiaryNotice: () => stubPart("diary-notice")() }),
)
vi.mock("../../../../src/browser/components/page/achievement/achievement.tsx", () => ({
  Achievement: () => stubPart("achievement")(),
}))
vi.mock("../../../../src/browser/components/page/character/character.tsx", () => ({
  Character: () => stubPart("character")(),
}))
vi.mock("../../../../src/browser/components/page/token-usage/token-usage.tsx", () => ({
  TokenUsage: () => stubPart("token-usage")(),
}))
vi.mock("../../../../src/browser/domain/browser-error-report.ts", () => ({
  reportBrowserError: vi.fn<() => void>(),
}))

beforeEach(() => {
  failing.names.clear()
  window.location.hash = ""
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function moveTo(hash: string): Promise<void> {
  await act(async () => {
    window.location.hash = hash
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe("Layout の描画の失敗の受け止め", () => {
  it("ほかの画面が throw しても、説明と読み込み直すボタンを出し、画面のナビは残る", async () => {
    failing.names.add("character")
    render(<Layout />)

    await moveTo("#character")

    expect(
      within(screen.getByRole("alert")).getByRole("button", { name: "読み込み直す" }),
    ).toBeDefined()
    expect(screen.getByRole("navigation", { name: "画面のナビ" })).toBeDefined()
  })

  it("別の画面へ移ると、失敗していた画面の印が消える", async () => {
    failing.names.add("character")
    render(<Layout />)
    await moveTo("#character")
    expect(screen.getByRole("alert")).toBeDefined()

    await moveTo("#token-usage")

    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByTestId("token-usage")).toBeDefined()
  })

  it("会話の画面が throw しても、帯と書き終わりの知らせは巻き込まれない", () => {
    failing.names.add("conversation")
    render(<Layout />)

    expect(screen.getAllByRole("alert")).toHaveLength(1)
    expect(screen.getByRole("navigation", { name: "画面のナビ" })).toBeDefined()
    expect(screen.getByTestId("diary-notice")).toBeDefined()
  })

  it("書き終わりの知らせが throw しても、会話の画面は残る", () => {
    failing.names.add("diary-notice")
    render(<Layout />)

    // 書き終わりの知らせは成果の画面でないと隠れているので、隠れた要素も数える。
    expect(screen.getAllByRole("alert", { hidden: true })).toHaveLength(1)
    expect(screen.getByTestId("conversation")).toBeDefined()
  })
})
