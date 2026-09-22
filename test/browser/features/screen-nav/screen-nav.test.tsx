import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { ScreenNav } from "../../../../src/browser/features/screen-nav/screen-nav.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { type PendingAsk } from "../../../../src/shared/pending-ask.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/shared/session-state.ts"
import { sessionStoreWith } from "../../session-store.ts"

// 手で書いた架空の答え待ち（許可の問い合わせ1件。docs/coding-standards.md「会話内容の扱い」）。
const FIXTURE_PENDING: PendingAsk = {
  kind: "permission",
  id: "ask-1",
  toolName: "Read",
  input: {},
}

afterEach(() => {
  cleanup()
  window.location.hash = ""
})

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
