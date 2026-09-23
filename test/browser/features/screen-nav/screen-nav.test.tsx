import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { ScreenNav } from "../../../../src/browser/features/screen-nav/screen-nav.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { type PendingAsk } from "../../../../src/shared/pending-ask.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionInfo,
  type SessionState,
} from "../../../../src/shared/session-state.ts"
import { setPageUrl } from "../../../dom-environment.ts"
import { sessionStoreWith } from "../../session-store.ts"

// 手で書いた架空の答え待ち（許可の問い合わせ1件。docs/coding-standards.md「会話内容の扱い」）。
const FIXTURE_PENDING: PendingAsk = {
  kind: "permission",
  id: "ask-1",
  toolName: "Read",
  input: {},
}

/** 帯に並んでいる読み（狭い画面の「≡」の中は数えない）。 */
function readingTexts(): readonly string[] {
  return [...document.querySelectorAll(".screen-nav > .screen-nav-status > *")].map(
    (node) => node.textContent ?? "",
  )
}

// 部屋の名前はこのページを配っているポートから決まる（`src/shared/room.ts`）ので、
// ポートを見るテストは URL ごと差し替える。既定へ戻すのは afterEach。
const DEFAULT_PAGE_URL = "http://127.0.0.1/"

afterEach(() => {
  cleanup()
  setPageUrl(DEFAULT_PAGE_URL)
  window.location.hash = ""
})

/**
 * `init` が届いたあと（`running`）の架空の土台。`permissionMode` だけ変えて使う。**`model` は
 * ここに無い**（`SessionState.model` は `session` と独立なので、`renderScreenNav` の第一引数に
 * 直接渡す）。既定値は見た目上の既定（`PERMISSION_MODE_FALLBACK`）に合わせてある。
 */
const RUNNING_SESSION: Extract<SessionInfo, { kind: "running" }> = {
  kind: "running",
  sessionId: "s-fixture",
  permissionMode: "auto",
}

function renderScreenNav(state: Partial<SessionState> = {}): void {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, ...state })
  render(
    <SessionStoreContext.Provider value={store}>
      <ScreenNav />
    </SessionStoreContext.Provider>,
  )
}

/** 帯に並んでいる口（狭い画面の「≡」の中は数えない）。 */
function gateNames(): readonly string[] {
  return [...document.querySelectorAll(".screen-nav-gates a")].map((node) => node.textContent ?? "")
}

describe("ScreenNav", () => {
  it("3つの口（会話 / キャラクター / トークン消費）を hash のリンクで出す", () => {
    renderScreenNav()

    expect(gateNames()).toEqual(["会話", "キャラクター", "トークン消費"])
    expect(screen.getByRole("link", { name: "会話" }).getAttribute("href")).toBe("#")
    expect(screen.getByRole("link", { name: "キャラクター" }).getAttribute("href")).toBe(
      "#character",
    )
    expect(screen.getByRole("link", { name: "トークン消費" }).getAttribute("href")).toBe(
      "#token-usage",
    )
  })

  // 作る画面はキャラクター画面から入る一時的な画面なので、帯には並べない（13.9）。
  it("作る画面の口は帯に出ない", () => {
    renderScreenNav()

    expect(document.querySelector('.screen-nav a[href="#character/new"]')).toBeNull()
  })

  // **色だけで伝えない**ので、いまの画面の口には地と字の濃さを変える class が付く（13.9）。
  it("いま出している画面の口に is-active が付く", () => {
    window.location.hash = "#token-usage"
    renderScreenNav()

    expect(screen.getByRole("link", { name: "トークン消費" }).className).toContain("is-active")
    expect(screen.getByRole("link", { name: "会話" }).className).not.toContain("is-active")
    expect(screen.getByRole("link", { name: "トークン消費" }).getAttribute("aria-current")).toBe(
      "page",
    )
  })

  it("hash が無いときは会話の口が is-active", () => {
    window.location.hash = ""
    renderScreenNav()

    expect(screen.getByRole("link", { name: "会話" }).className).toContain("is-active")
  })

  it("答え待ちがあるときだけ、帯の右端に印を出す", () => {
    renderScreenNav()
    expect(document.querySelector(".screen-nav-pending")).toBeNull()

    cleanup()
    renderScreenNav({ pending: [FIXTURE_PENDING] })

    expect(document.querySelector(".screen-nav-pending")?.textContent).toBe("答え待ち")
  })

  // 部屋の名前は帯の左端（13.9）。**ポートの並び順に割り当たる**（`src/shared/room.ts`）ので、
  // 出ている名前でどの tsukumo を見ているかが分かる。
  it("帯の左端に、このページのポートの部屋の名前を出す", () => {
    setPageUrl("http://127.0.0.1:7329/")
    renderScreenNav()

    expect(document.querySelector(".screen-nav > .screen-nav-room")?.textContent).toBe("菜の花の間")
  })

  // 語彙の外のポートは番号のまま（13個め以降・`TSUKUMO_VIEW_PORT` で遠い番号を指したとき）。
  it("語彙の外のポートでは、番号をそのまま帯に出す", () => {
    setPageUrl("http://127.0.0.1:9000/")
    renderScreenNav()

    expect(document.querySelector(".screen-nav > .screen-nav-room")?.textContent).toBe("9000")
  })

  // 狭い画面の「≡」（広い画面では CSS が消す。ここでは DOM の有無だけを見る）。
  it("「≡」を押すと3つの口が落ちてきて、もう一度押すと閉じる", () => {
    renderScreenNav()
    const toggle = screen.getByRole("button", { name: "画面を選ぶ" })
    expect(document.querySelector(".screen-nav-panel")).toBeNull()

    fireEvent.click(toggle)
    const opened = document.querySelector(".screen-nav-panel")
    expect([...(opened?.querySelectorAll("a") ?? [])].map((node) => node.textContent)).toEqual([
      "会話",
      "キャラクター",
      "トークン消費",
    ])
    expect(toggle.getAttribute("aria-expanded")).toBe("true")

    fireEvent.click(toggle)
    expect(document.querySelector(".screen-nav-panel")).toBeNull()
  })

  it("落ちてきた口を押すと閉じる（画面が移るので開いたままにしない）", () => {
    renderScreenNav()
    fireEvent.click(screen.getByRole("button", { name: "画面を選ぶ" }))

    const panelGate = document.querySelector(".screen-nav-panel a")
    fireEvent.click(panelGate as Element)

    expect(document.querySelector(".screen-nav-panel")).toBeNull()
  })

  it("帯の外側を押すと閉じる", () => {
    renderScreenNav()
    fireEvent.click(screen.getByRole("button", { name: "画面を選ぶ" }))

    fireEvent.pointerDown(document.body)

    expect(document.querySelector(".screen-nav-panel")).toBeNull()
  })

  // 狭い画面は帯の左端が無い（「≡」だけになる）ので、名前は落ちてくる面の先頭に出す（13.9）。
  it("「≡」を開くと、落ちてきた面の先頭にも部屋の名前が出る", () => {
    setPageUrl("http://127.0.0.1:7328/")
    renderScreenNav()

    fireEvent.click(screen.getByRole("button", { name: "画面を選ぶ" }))

    expect(document.querySelector(".screen-nav-panel .screen-nav-room")?.textContent).toBe(
      "若葉の間",
    )
  })

  // 帯に出すのは**画面を見ても分からず、ターンの結果を変えるもの**の2つ（13.9）。
  it("モデルと許可モードを帯の読みとして出す", () => {
    renderScreenNav({
      model: "claude-sonnet-5",
      session: { ...RUNNING_SESSION, permissionMode: "plan" },
    })

    expect(readingTexts()).toEqual(["Sonnet", "プラン"])
  })

  // 届く前でも見た目上の既定に倒す（サイドバーの `<select>` と同じ値）。
  it("model / permissionMode が届く前は既定の読みを出す", () => {
    renderScreenNav()

    expect(readingTexts()).toEqual(["Opus", "自動判定"])
  })

  // 「全部許す」だけ字に意味の色を載せる（ラベルの文字が必ず付くので色だけに頼らない。13.1 原則5）。
  it("許可モードが「全部許す」のときだけ字に is-danger が付く", () => {
    renderScreenNav({ session: { ...RUNNING_SESSION, permissionMode: "bypassPermissions" } })
    expect(document.querySelector(".screen-nav-permission-mode")?.className).toContain("is-danger")

    cleanup()
    renderScreenNav({ session: { ...RUNNING_SESSION, permissionMode: "acceptEdits" } })
    expect(document.querySelector(".screen-nav-permission-mode")?.className).not.toContain(
      "is-danger",
    )
  })

  // 狭い画面では帯に読みを置く幅が無いので、口と同じく「≡」の中へ入る（13.9）。
  it("「≡」を開くと、落ちてきた面にも読みが出る", () => {
    renderScreenNav({ model: "claude-haiku-5" })

    fireEvent.click(screen.getByRole("button", { name: "画面を選ぶ" }))

    expect(
      [...document.querySelectorAll(".screen-nav-panel .screen-nav-status > *")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["Haiku", "自動判定"])
  })

  // 狭い画面では「答え待ち」の字を置く幅が無いので、閉じている間は「≡」に印を添える（13.9）。
  it("答え待ちの間は「≡」に印が付き、開くと字でも出る", () => {
    renderScreenNav({ pending: [FIXTURE_PENDING] })
    const toggle = screen.getByRole("button", { name: "画面を選ぶ（答え待ち）" })
    expect(document.querySelector(".screen-nav-toggle-mark")).not.toBeNull()

    fireEvent.click(toggle)

    expect(document.querySelector(".screen-nav-panel .screen-nav-pending")?.textContent).toBe(
      "答え待ち",
    )
  })
})
