// サイドバー全体の組み立て。下端の帯（`.sidebar-footer`。コンテキストの使用量）は区画ではないので、
// 見出しを名乗らず、区画の枠（`SidebarSection`）も通らない。見出しはタスクの1つだけになる。
// キャラクターとセッションの切り替えはサイドバーに無い（帯の左上。docs/screen-design.md 13.9）。
//
// 雑談中は4段に差し替わる（docs/screen-design.md 13.7「雑談のときのサイドバー」）: プロフィールの札・
// 最近の話題・覚えていること・下端の帯。タスク一覧は出さない。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Sidebar } from "../../../../../src/browser/components/domain/sidebar/sidebar.tsx"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session-state.ts"
import { characterInfo, characterPackEntry } from "../../../../fixture/character.ts"
import { rpcError, stubRpcFetch, type RpcFetchStub } from "../../../rpc-fetch-stub.ts"
import { putSession } from "../../../session-store.ts"

// 下端の帯は `<ContextUsageRow>`（`useContextUsage`。`useQuery`）を持つので、
// ここのテストにも `QueryClientProvider` が要る。内訳の中身は測らないので、
// 取りに行った先は常に「取れない」に落とす軽いスタブで足りる。

let fetchStub: RpcFetchStub | undefined = undefined

afterEach(() => {
  cleanup()
  fetchStub?.restore()
  fetchStub = undefined
})

function stubContextUsageUnavailable(): void {
  fetchStub = stubRpcFetch(() => rpcError(500))
}

function renderSidebar(stateOverrides: Partial<SessionState>): void {
  stubContextUsageUnavailable()
  putSession({ ...INITIAL_SESSION_STATE, ...stateOverrides })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <Sidebar />
    </QueryClientProvider>,
  )
}

describe("Sidebar", () => {
  it("見出しは「タスク」の1つだけ（「セッション情報」の見出しは無い）", () => {
    renderSidebar({
      characterPacks: [characterPackEntry("tsukumo-spirit", "つくもの精霊")],
      character: characterInfo({ pack: "tsukumo-spirit" }),
    })

    // 見出しの `<h2>` には「一覧を見る」ボタンも同居するので、区画の題（`.sidebar-block-title`）
    // だけを見る。
    const titles = document.querySelectorAll(".sidebar-block-title")
    expect(Array.from(titles).map((title) => title.textContent)).toEqual(["タスク"])
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1)
    expect(screen.queryByText("セッション情報")).toBeNull()
  })

  it("下端の帯は区画の外に出て、キャラクターとセッションの切り替えは置かない", () => {
    renderSidebar({
      characterPacks: [characterPackEntry("tsukumo-spirit", "つくもの精霊")],
      character: characterInfo({ pack: "tsukumo-spirit", face: "/character/face.png" }),
    })

    // 帯は区画の枠（`SidebarSection`）を通らないので、`.sidebar-block` の中には入らない。
    const footer = document.querySelector(".sidebar-footer")
    expect(footer?.closest(".sidebar-block")).toBeNull()
    expect(footer?.textContent).toContain("コンテキスト")
    expect(screen.queryByLabelText("キャラクター")).toBeNull()
    expect(screen.queryByLabelText("セッション")).toBeNull()
  })
})

const RUNNING_SESSION: SessionState["session"] = {
  kind: "running",
  sessionId: "s-fixture",
  permissionMode: "default",
}

const CHAT_STATE: Partial<SessionState> = {
  chatMode: true,
  characterPacks: [characterPackEntry("tsukumo-spirit", "つくもの精霊")],
  character: characterInfo({
    pack: "tsukumo-spirit",
    name: "架空の精霊",
    tagline: "窓辺に棲む架空の精霊",
  }),
  session: RUNNING_SESSION,
  sessions: [
    {
      viewPort: 7327,
      sessionId: "s-fixture",
      heading: "架空の見出し",
      lastModified: 0,
      startedAt: 0,
    },
  ],
}

function headingTitles(): readonly (string | null)[] {
  return Array.from(document.querySelectorAll(".sidebar-block-title")).map(
    (title) => title.textContent,
  )
}

describe("Sidebar（雑談中）", () => {
  it("タスク一覧を出さず、プロフィールの札を出す", () => {
    renderSidebar(CHAT_STATE)

    expect(headingTitles()).not.toContain("タスク")
    expect(screen.queryByRole("button", { name: "一覧を見る" })).toBeNull()
    expect(document.querySelector(".profile-card")).not.toBeNull()
    expect(screen.getByText("架空の精霊")).toBeDefined()
    expect(screen.getByText("窓辺に棲む架空の精霊")).toBeDefined()
  })

  it("上から札・最近の話題・覚えていること・下端の帯の4段に並ぶ", () => {
    renderSidebar(CHAT_STATE)

    expect(headingTitles()).toEqual(["最近の話題", "覚えていること"])
    const card = document.querySelector(".profile-card")
    const footer = document.querySelector(".sidebar-footer")
    const topics = screen.getByRole("heading", { name: "最近の話題" })
    // DOM の並び順（`compareDocumentPosition` の FOLLOWING = 4）で上下を確かめる。
    expect(card?.compareDocumentPosition(topics)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(footer === null ? 0 : topics.compareDocumentPosition(footer)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it("最近の話題と覚えていることは、空のときの案内を出す", () => {
    renderSidebar(CHAT_STATE)

    expect(screen.getByText("まだ話題が無い（話が積もると、ここに並ぶ）")).toBeDefined()
    expect(screen.getByText("まだ覚えていることが無い")).toBeDefined()
  })

  it("最近の話題は、届いた見出しを届いた順（新しい順）に並べ、案内は出さない", () => {
    renderSidebar({
      ...CHAT_STATE,
      chatTopics: ["架空の新しい話題", "架空の二番目の話題", "架空の三番目の話題"],
    })

    const topics = screen.getByRole("list", { name: "最近の話題" })
    expect(Array.from(topics.querySelectorAll("li")).map((item) => item.textContent)).toEqual([
      "架空の新しい話題",
      "架空の二番目の話題",
      "架空の三番目の話題",
    ])
    expect(screen.queryByText(/まだ話題が無い/u)).toBeNull()
  })

  it("キャラクターの <select> は札の「変える」にだけ出る", () => {
    renderSidebar(CHAT_STATE)

    expect(screen.queryByLabelText("キャラクター")).toBeNull()
    expect(screen.getByLabelText("キャラクターを変える")).toBeDefined()
  })
})

describe("Sidebar（仕事）", () => {
  it("今までどおりタスク一覧と下端の帯を出し、プロフィールの札は出さない", () => {
    renderSidebar({ ...CHAT_STATE, chatMode: false })

    expect(headingTitles()).toEqual(["タスク"])
    expect(document.querySelector(".profile-card")).toBeNull()
    expect(document.querySelector(".sidebar-footer")).not.toBeNull()
    expect(screen.queryByLabelText("キャラクターを変える")).toBeNull()
  })
})
