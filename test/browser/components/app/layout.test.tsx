import { act, cleanup, render, screen, within } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { deferredScreen } from "../../../../src/browser/components/app/deferred-screen.tsx"
import { Layout, type LayoutScreens } from "../../../../src/browser/components/app/layout.tsx"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import { characterPackEntry } from "../../../fixture/character.ts"
import { putSession } from "../../session-store.ts"

// 名前を入れた部品は、描くときに throw する。
const failing = vi.hoisted(() => ({ names: new Set<string>() }))
// 遅延読み込みの工場が走った（モジュールが読まれた）画面の名前。
const loaded = vi.hoisted(() => ({ names: new Set<string>() }))

vi.mock("../../../../src/browser/stores/browser-error-report.ts", () => ({
  reportBrowserError: vi.fn<() => void>(),
}))

function stubPart(name: string): () => ReactElement {
  return function StubPart(): ReactElement {
    if (failing.names.has(name)) {
      throw new Error(`${name} の描画の失敗（テスト用）`)
    }
    return <div data-testid={name} />
  }
}

function stubElement(name: string): ReactElement {
  const Part = stubPart(name)
  return <Part />
}

function deferredStub(name: string): ReactElement {
  const Part = deferredScreen(async () => {
    loaded.names.add(name)
    return stubPart(name)
  })
  return <Part />
}

/** 画面の部品の代役を並べた登録表。 */
function stubScreens(): LayoutScreens {
  return {
    skipLink: <div />,
    diaryNotice: stubElement("diary-notice"),
    conversation: stubElement("conversation"),
    overlay: {
      character: deferredStub("character"),
      "token-usage": deferredStub("token-usage"),
      achievement: deferredStub("achievement"),
      tasks: stubElement("tasks"),
      settings: stubElement("settings"),
      design: deferredStub("design"),
    },
  }
}

beforeEach(() => {
  failing.names.clear()
  loaded.names.clear()
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

describe("Layout の重ねる紙", () => {
  it("ほかの画面を会話の画面の上に紙で重ね、紙を閉じると会話の画面へ戻る", async () => {
    render(<Layout screens={stubScreens()} />)

    await moveTo("#settings")

    expect(screen.getByTestId("settings").closest("dialog")?.getAttribute("aria-label")).toBe(
      "設定",
    )
    expect(screen.getByTestId("conversation")).toBeDefined()

    await act(async () => {
      screen.getByRole("button", { name: /閉じる/, hidden: true }).click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(window.location.hash).toBe("")
  })

  it("キャラクターの紙を開くと、見出しの横に人数が出る", async () => {
    putSession({
      ...INITIAL_SESSION_STATE,
      characterPacks: [characterPackEntry("a", "甲"), characterPackEntry("b", "乙")],
    })
    render(<Layout screens={stubScreens()} />)

    await moveTo("#character")

    expect(await screen.findByText("2人")).toBeDefined()
  })

  it("使用量の紙を開くと、見出しの横に補いが出る", async () => {
    render(<Layout screens={stubScreens()} />)

    await moveTo("#token-usage")

    expect(await screen.findByText("このセッションと、プランの枠")).toBeDefined()
  })

  it("見本帳は紙にせず、会話の画面と入れ替えて出す", async () => {
    render(<Layout screens={stubScreens()} />)

    await moveTo("#design")

    expect((await screen.findByTestId("design")).closest("dialog")).toBeNull()
    expect(screen.getByTestId("conversation").style.display).toBe("none")
  })
})

describe("Layout の描画の失敗の受け止め", () => {
  it("会話の画面だけのあいだは、会話以外の画面のモジュールを読まない。画面を開くと、その画面だけ読む", async () => {
    render(<Layout screens={stubScreens()} />)
    expect([...loaded.names]).toEqual([])

    await moveTo("#token-usage")

    expect(await screen.findByTestId("token-usage")).toBeDefined()
    expect([...loaded.names]).toEqual(["token-usage"])
  })

  it("ほかの画面が throw しても、説明と読み込み直すボタンを出し、会話の画面は残る", async () => {
    failing.names.add("character")
    render(<Layout screens={stubScreens()} />)

    await moveTo("#character")

    expect(
      within(await screen.findByRole("alert", { hidden: true })).getByRole("button", {
        name: "読み込み直す",
        hidden: true,
      }),
    ).toBeDefined()
    expect(screen.getByTestId("conversation")).toBeDefined()
  })

  it("別の画面へ移ると、失敗していた画面の印が消える", async () => {
    failing.names.add("character")
    render(<Layout screens={stubScreens()} />)
    await moveTo("#character")
    expect(await screen.findByRole("alert", { hidden: true })).toBeDefined()

    await moveTo("#token-usage")

    expect(await screen.findByTestId("token-usage")).toBeDefined()
    expect(screen.queryByRole("alert", { hidden: true })).toBeNull()
  })

  it("会話の画面が throw しても、書き終わりの知らせは巻き込まれない", () => {
    failing.names.add("conversation")
    render(<Layout screens={stubScreens()} />)

    expect(screen.getAllByRole("alert")).toHaveLength(1)
    expect(screen.getByTestId("diary-notice")).toBeDefined()
  })

  it("書き終わりの知らせが throw しても、会話の画面は残る", () => {
    failing.names.add("diary-notice")
    render(<Layout screens={stubScreens()} />)

    // 書き終わりの知らせは成果の画面でないと隠れているので、隠れた要素も数える。
    expect(screen.getAllByRole("alert", { hidden: true })).toHaveLength(1)
    expect(screen.getByTestId("conversation")).toBeDefined()
  })
})
