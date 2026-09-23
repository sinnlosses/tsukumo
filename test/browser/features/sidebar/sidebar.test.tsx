// サイドバー全体の組み立て（docs/design.md 13.9「顔」）。**「セッション情報」の区画は見出しを
// 名乗らない**——タスクの区画（見出し「タスク」）と同じ枠を借りるだけで、区画自体は消えない。

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

  it("見出しの無い区画にもキャラクターの <select> は出る", () => {
    renderSidebar({
      characterPacks: [{ name: "tsukumo-spirit", label: "つくもの精霊" }],
      character: characterInfo({ pack: "tsukumo-spirit" }),
    })

    expect(screen.getByLabelText("キャラクター")).toBeDefined()
  })
})
