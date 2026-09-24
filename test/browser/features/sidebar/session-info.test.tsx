import { afterEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { SessionInfo } from "../../../../src/browser/features/sidebar/session-info.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import {
  INITIAL_SESSION_STATE,
  type SessionInfo as SessionInfoState,
  type SessionState,
} from "../../../../src/shared/session-state.ts"
import { characterInfo, characterPackEntry } from "../../../fixture/character.ts"
import { type CommandSpy, sessionStoreWith } from "../../session-store.ts"

// `<SessionInfo>` は `<ContextUsageRow>`（`useContextUsage`。`useQuery`）を持つので、
// ここのテストにも `QueryClientProvider` が要る。**ここでの内訳の中身は測らない**
// （それは `test/browser/features/sidebar/context-usage-row.test.tsx`）ので、取りに行った先は
// 常に「取れない」に落とす軽いスタブで足りる。

let originalFetch: typeof globalThis.fetch | undefined = undefined

afterEach(() => {
  cleanup()
  if (originalFetch !== undefined) {
    globalThis.fetch = originalFetch
    originalFetch = undefined
  }
})

function stubContextUsageUnavailable(): void {
  originalFetch = globalThis.fetch
  const stub = (): Promise<{ ok: false; status: 500; json: () => Promise<unknown> }> =>
    Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve(null) })
  globalThis.fetch = stub as unknown as typeof globalThis.fetch
}

function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

/**
 * `init` が届いたあと（`running`）の架空の土台。テストはここから `permissionMode` /
 * `sessionId` だけを変えて使う。
 */
const RUNNING_SESSION: Extract<SessionInfoState, { kind: "running" }> = {
  kind: "running",
  sessionId: "s-fixture",
  permissionMode: "default",
}

/**
 * 本物の WebSocket 接続（`<App>`）を経由せず、`SessionContext` へ直接値を差し込んで描く
 * （`src/browser/stores/session.tsx` が部品のテスト用に Context 自体を公開している）。
 */
function renderSessionInfo(
  stateOverrides: Partial<SessionState>,
  dispatch: CommandSpy = () => {},
): void {
  stubContextUsageUnavailable()
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, ...stateOverrides }, dispatch)
  render(
    <SessionStoreContext.Provider value={store}>
      <QueryClientProvider client={newQueryClient()}>
        <SessionInfo withCharacter={true} />
      </QueryClientProvider>
    </SessionStoreContext.Provider>,
  )
}

// 手で書いた架空のキャラクター定義（docs/coding-standards.md「会話内容の扱い」）。
const FIXTURE_CHARACTER: NonNullable<SessionState["character"]> = characterInfo()

function selectValue(element: HTMLElement): string {
  return (element as HTMLSelectElement).value
}

describe("SessionInfo", () => {
  // 仕事/雑談のトグル・モデル・許可モードのドロップダウンは帯（`features/screen-nav/`）へ
  // 移った（docs/screen-design.md 13.9「何を外すか」）。ここに同じ <select> を2つ置かない。
  it("モード・モデル・許可モードの <select> は無い（帯へ移った）", () => {
    renderSessionInfo({
      model: "claude-sonnet-5",
      chatMode: true,
      session: { ...RUNNING_SESSION, permissionMode: "plan" },
    })

    expect(screen.queryByLabelText("モード")).toBeNull()
    expect(screen.queryByLabelText("モデル")).toBeNull()
    expect(screen.queryByLabelText("許可モード")).toBeNull()
  })

  it("キャラクターの <select> は選択肢が1つでも出す", () => {
    renderSessionInfo({
      characterPacks: [characterPackEntry("tsukumo-spirit", "つくもの精霊")],
      character: { ...FIXTURE_CHARACTER, pack: "tsukumo-spirit" },
    })

    const select = screen.getByLabelText("キャラクター")
    expect(selectValue(select)).toBe("tsukumo-spirit")
    expect((select as HTMLSelectElement).options).toHaveLength(1)
  })

  // キャラクター画面への入る口は**帯**（`features/screen-nav/`）へ移った（docs/screen-design.md 13.9）。
  // ここには同じ口を2つ置かない。
  it("キャラクターの行にキャラクター画面への口は置かない", () => {
    renderSessionInfo({
      characterPacks: [characterPackEntry("tsukumo-spirit", "つくもの精霊")],
      character: { ...FIXTURE_CHARACTER, pack: "tsukumo-spirit" },
    })

    expect(document.querySelector('a[href="#character"]')).toBeNull()
  })

  it("キャラクターを変更すると switch-character が dispatch される", () => {
    const calls: unknown[] = []
    renderSessionInfo(
      {
        characterPacks: [
          characterPackEntry("tsukumo-spirit", "つくもの精霊"),
          characterPackEntry("local", "架空の同居人"),
        ],
        character: { ...FIXTURE_CHARACTER, pack: "tsukumo-spirit" },
      },
      (command) => {
        calls.push(command)
      },
    )

    fireEvent.change(screen.getByLabelText("キャラクター"), { target: { value: "local" } })

    expect(calls).toEqual([{ type: "switch-character", name: "local" }])
  })

  it("ターン進行中はキャラクターの <select> が無効になり、理由が title に出る", () => {
    renderSessionInfo({
      turn: { kind: "running", startedAt: 0 },
      characterPacks: [characterPackEntry("tsukumo-spirit", "つくもの精霊")],
      character: { ...FIXTURE_CHARACTER, pack: "tsukumo-spirit" },
    })

    const select = screen.getByLabelText("キャラクター") as HTMLSelectElement
    expect(select.disabled).toBe(true)
    expect(select.title.length).toBeGreaterThan(0)
  })

  it("ターンが終わるとキャラクターの <select> は有効に戻る", () => {
    renderSessionInfo({
      turn: { kind: "idle" },
      characterPacks: [characterPackEntry("tsukumo-spirit", "つくもの精霊")],
      character: { ...FIXTURE_CHARACTER, pack: "tsukumo-spirit" },
    })

    const select = screen.getByLabelText("キャラクター") as HTMLSelectElement
    expect(select.disabled).toBe(false)
    expect(select.title).toBe("")
  })

  it("パックの一覧が届いていなければ、キャラクターの <select> は出さない", () => {
    renderSessionInfo({})

    expect(screen.queryByLabelText("キャラクター")).toBeNull()
  })
})

// 顔はキャラクターの <select> の左に添える（帯と共有する components/character-face.tsx。
// docs/screen-design.md 13.9「顔」）。
describe("SessionInfo の顔", () => {
  it("定義に face があれば、alt にキャラクターの名前を付けて出す", () => {
    renderSessionInfo({
      characterPacks: [characterPackEntry("tsukumo-spirit", "つくもの精霊")],
      character: {
        ...FIXTURE_CHARACTER,
        pack: "tsukumo-spirit",
        name: "架空の精霊",
        face: "/character/face.png",
      },
    })

    const face = document.querySelector(".session-info-face")
    expect(face?.tagName).toBe("IMG")
    expect(face?.getAttribute("src")).toBe("/character/face.png")
    expect(face?.getAttribute("alt")).toBe("架空の精霊")
  })

  it("face が無いパックでは何も出さない", () => {
    renderSessionInfo({
      characterPacks: [characterPackEntry("tsukumo-spirit", "つくもの精霊")],
      character: { ...FIXTURE_CHARACTER, pack: "tsukumo-spirit", face: undefined },
    })

    expect(document.querySelector(".session-info-face")).toBeNull()
  })

  it("キャラクターを切り替えると顔も変わる（character-changed で state.character が入れ替わる想定）", () => {
    renderSessionInfo({
      characterPacks: [characterPackEntry("tsukumo-spirit", "つくもの精霊")],
      character: {
        ...FIXTURE_CHARACTER,
        pack: "tsukumo-spirit",
        name: "甲",
        face: "/character/a-face.png",
      },
    })
    expect(document.querySelector(".session-info-face")?.getAttribute("src")).toBe(
      "/character/a-face.png",
    )

    cleanup()
    renderSessionInfo({
      characterPacks: [characterPackEntry("local", "架空の同居人")],
      character: {
        ...FIXTURE_CHARACTER,
        pack: "local",
        name: "乙",
        face: "/character/b-face.png",
      },
    })
    expect(document.querySelector(".session-info-face")?.getAttribute("src")).toBe(
      "/character/b-face.png",
    )
    expect(document.querySelector(".session-info-face")?.getAttribute("alt")).toBe("乙")
  })
})

// 並びは寿命順ではなく触る頻度順（`session-info.tsx` の冒頭コメント）。
describe("SessionInfo の並び", () => {
  it("並びは キャラクター・セッション の順", () => {
    renderSessionInfo({
      characterPacks: [characterPackEntry("tsukumo-spirit", "つくもの精霊")],
      character: { ...FIXTURE_CHARACTER, pack: "tsukumo-spirit" },
      sessions: [{ sessionId: "s1", viewPort: 7327, lastModified: 0, heading: undefined }],
      session: { ...RUNNING_SESSION, sessionId: "s1" },
    })

    const labels = screen
      .getAllByText(/^(キャラクター|セッション)$/)
      .map((element) => element.textContent)

    expect(labels).toEqual(["キャラクター", "セッション"])
  })
})
