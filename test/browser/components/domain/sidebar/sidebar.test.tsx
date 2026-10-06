import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Sidebar } from "../../../../../src/browser/components/domain/sidebar/sidebar.tsx"
import type { TaskSummaryItem } from "../../../../../src/shared/repository/task-summary.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session/session-state.ts"
import { characterInfo, characterPackEntry } from "../../../../fixture/character.ts"
import { createTestQueryClient } from "../../../query-client.tsx"
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
  const client = createTestQueryClient()
  render(
    <QueryClientProvider client={client}>
      <Sidebar />
    </QueryClientProvider>,
  )
}

describe("Sidebar の下端の帯", () => {
  it("コンテキストの目盛りを押すと詳しい面が開き、もう一度押すと閉じる", () => {
    renderSidebar({})

    const gauge = screen.getByRole("button", { name: /^コンテキスト/ })
    expect(gauge.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(gauge)
    expect(gauge.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByRole("region", { name: "使用量の詳しい面" }).textContent).toContain("利用枠")
    fireEvent.click(gauge)
    expect(screen.queryByRole("region", { name: "使用量の詳しい面" })).toBeNull()
  })
})

describe("Sidebar のタスクの節", () => {
  it("タスク運用を使わないプロジェクトでは、節ごと出さない", () => {
    renderSidebar({ tasks: { kind: "off" } })

    expect(screen.queryByRole("region", { name: "タスク" })).toBeNull()
  })

  it("使わないと決めていなければ節を出し、見出しに歯車は無い", () => {
    renderSidebar({})

    const section = screen.getByRole("region", { name: "タスク" })
    expect(section.querySelector('button[aria-label="プロジェクトの設定"]')).toBeNull()
  })

  it("チップは1つだけ選べ、押し直しても変わらず、「すべて」で外れ、別のチップで切り替わる", () => {
    renderSidebar({
      tasks: {
        kind: "known",
        items: [chipTask("X-001", "todo"), chipTask("X-002", "done")],
        runPrompt: "/next-task {id}",
      },
    })
    const shown = (): readonly string[] =>
      [...document.querySelectorAll("[id^='task-row-']")].map((element) => element.id)
    const pressed = (): readonly string[] =>
      screen.getAllByRole("button", { pressed: true }).map((button) => button.textContent ?? "")

    expect(pressed()).toEqual(["すべて 2"])

    fireEvent.click(screen.getByRole("button", { name: "未着手 1" }))
    expect(pressed()).toEqual(["未着手 1"])
    expect(shown()).toEqual(["task-row-X-001"])

    fireEvent.click(screen.getByRole("button", { name: "未着手 1" }))
    expect(pressed()).toEqual(["未着手 1"])
    expect(shown()).toEqual(["task-row-X-001"])

    fireEvent.click(screen.getByRole("button", { name: "完了 1" }))
    expect(pressed()).toEqual(["完了 1"])
    expect(shown()).toEqual(["task-row-X-002"])

    fireEvent.click(screen.getByRole("button", { name: "すべて 2" }))
    expect(pressed()).toEqual(["すべて 2"])
    expect(shown()).toEqual(["task-row-X-001", "task-row-X-002"])
  })
})

function chipTask(id: string, status: string): TaskSummaryItem {
  return {
    id,
    summary: `架空のタスク ${id}`,
    status,
    difficulty: undefined,
    loopable: undefined,
    dependencies: [],
    assignee: undefined,
    body: "",
    location: { kind: "none" },
  }
}

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

describe("Sidebar（雑談中）", () => {
  it("覚えていることが空のときは案内を出す", () => {
    renderSidebar(CHAT_STATE)

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
})
