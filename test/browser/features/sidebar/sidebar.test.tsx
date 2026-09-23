// サイドバー全体の組み立て（docs/design.md 13.9「顔」）。**セッション情報は区画ではなく下端の
// 帯**（`.sidebar-footer`）なので、見出しを名乗らず、区画の枠（`SidebarSection`）も通らない。
// 見出しはタスクの1つだけになる。

import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import { Sidebar } from "../../../../src/browser/features/sidebar/sidebar.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/shared/session-state.ts"
import { characterInfo } from "../../../fixture/character.ts"
import { sessionStoreWith } from "../../session-store.ts"

afterEach(() => {
  cleanup()
})

function renderSidebar(stateOverrides: Partial<SessionState>): void {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, ...stateOverrides })
  render(
    <SessionStoreContext.Provider value={store}>
      <Sidebar />
    </SessionStoreContext.Provider>,
  )
}

describe("Sidebar", () => {
  it("見出しは「タスク」の1つだけ（「セッション情報」の見出しは無い）", () => {
    renderSidebar({
      characterPacks: [{ name: "tsukumo-spirit", label: "つくもの精霊" }],
      character: characterInfo({ pack: "tsukumo-spirit" }),
    })

    // 見出しの `<h2>` には「一覧を見る」ボタンも同居するので、区画の題（`.sidebar-block-title`）
    // だけを見る。
    const titles = document.querySelectorAll(".sidebar-block-title")
    expect(Array.from(titles).map((title) => title.textContent)).toEqual(["タスク"])
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1)
    expect(screen.queryByText("セッション情報")).toBeNull()
  })

  it("キャラクターの <select> と顔は、区画ではなく下端の帯の中に出る", () => {
    renderSidebar({
      characterPacks: [{ name: "tsukumo-spirit", label: "つくもの精霊" }],
      character: characterInfo({ pack: "tsukumo-spirit", face: "/character/face.png" }),
    })

    // 帯は区画の枠（`SidebarSection`）を通らないので、`.sidebar-block` の中には入らない。
    const footer = document.querySelector(".sidebar-footer")
    expect(footer?.closest(".sidebar-block")).toBeNull()
    expect(footer?.contains(screen.getByLabelText("キャラクター"))).toBe(true)
    expect(footer?.querySelector("img")?.getAttribute("src")).toBe("/character/face.png")
  })
})
