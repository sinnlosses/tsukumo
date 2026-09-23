// 雑談中のサイドバーの最上段、プロフィールの札（docs/screen-design.md 13.7「雑談のときのサイドバー」）。
// 顔・名前・ひとことプロフィールと、右端の「変える」（キャラクターの切り替え）。**「変える」の
// 振る舞いは下端の帯のキャラクターの `<select>` と同じ**（選ぶと `switch-character`・ターン中は塞ぐ）。

import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { ProfileCard } from "../../../../src/browser/features/sidebar/profile-card.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/shared/session-state.ts"
import { characterInfo } from "../../../fixture/character.ts"
import { type CommandSpy, sessionStoreWith } from "../../session-store.ts"

afterEach(() => {
  cleanup()
})

const TWO_PACKS: SessionState["characterPacks"] = [
  { name: "fictional", label: "架空の精霊" },
  { name: "local", label: "架空の同居人" },
]

function renderProfileCard(
  stateOverrides: Partial<SessionState>,
  dispatch: CommandSpy = () => {},
): void {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, ...stateOverrides }, dispatch)
  render(
    <SessionStoreContext.Provider value={store}>
      <ProfileCard />
    </SessionStoreContext.Provider>,
  )
}

function changeSelect(): HTMLSelectElement {
  const select = screen.getByLabelText("キャラクターを変える")
  if (!(select instanceof HTMLSelectElement)) {
    throw new Error("「変える」が <select> になっていない")
  }
  return select
}

describe("ProfileCard", () => {
  it("顔・名前・ひとことプロフィールを出す", () => {
    renderProfileCard({
      characterPacks: TWO_PACKS,
      character: characterInfo({
        name: "架空の精霊",
        face: "/character/face.png",
        tagline: "窓辺に棲む架空の精霊",
      }),
    })

    expect(document.querySelector(".profile-card-name")?.textContent).toBe("架空の精霊")
    expect(document.querySelector(".profile-card-tagline")?.textContent).toBe(
      "窓辺に棲む架空の精霊",
    )
    const face = screen.getByRole("img")
    expect(face.getAttribute("src")).toBe("/character/face.png")
    expect(face.getAttribute("alt")).toBe("架空の精霊")
  })

  it("ひとことプロフィールが無いパックは名前だけ（空の行を置かない）", () => {
    renderProfileCard({
      characterPacks: TWO_PACKS,
      character: characterInfo({ name: "架空の精霊", tagline: undefined }),
    })

    expect(document.querySelector(".profile-card-name")?.textContent).toBe("架空の精霊")
    expect(document.querySelector(".profile-card-tagline")).toBeNull()
  })

  it("「変える」で選ぶと switch-character が dispatch される", () => {
    const calls: unknown[] = []
    renderProfileCard({ characterPacks: TWO_PACKS, character: characterInfo() }, (command) => {
      calls.push(command)
    })

    fireEvent.change(changeSelect(), { target: { value: "local" } })

    expect(calls).toEqual([{ type: "switch-character", name: "local" }])
  })

  it("「変える」の選択はいまのパックを指し、見える字は「変える」", () => {
    renderProfileCard({
      characterPacks: TWO_PACKS,
      character: characterInfo({ pack: "local" }),
    })

    expect(changeSelect().value).toBe("local")
    expect(document.querySelector(".profile-card-change")?.textContent).toContain("変える")
  })

  it("ターン進行中は「変える」が塞がり、理由が title に出る", () => {
    renderProfileCard({
      turn: { kind: "running", startedAt: 0 },
      characterPacks: TWO_PACKS,
      character: characterInfo(),
    })

    expect(changeSelect().disabled).toBe(true)
    expect(changeSelect().title.length).toBeGreaterThan(0)
  })

  it("パックの一覧が届いていなければ「変える」は出さない", () => {
    renderProfileCard({ character: characterInfo() })

    expect(screen.queryByLabelText("キャラクターを変える")).toBeNull()
  })
})
