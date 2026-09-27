// 雑談中のサイドバーの最上段、プロフィールの札（docs/screen-design.md「雑談のときのサイドバー」）。
// ここで見るのは、ひとことプロフィールが無いパックで空の行を置かないことだけ。

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ProfileCard } from "../../../../../src/browser/components/domain/sidebar/profile-card.tsx"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session/session-state.ts"
import { characterInfo, characterPackEntry } from "../../../../fixture/character.ts"
import { type CommandSpy, putSession } from "../../../session-store.ts"

afterEach(() => {
  cleanup()
})

const TWO_PACKS: SessionState["characterPacks"] = [
  characterPackEntry("fictional", "架空の精霊"),
  characterPackEntry("local", "架空の同居人"),
]

function renderProfileCard(
  stateOverrides: Partial<SessionState>,
  dispatch: CommandSpy = () => {},
): void {
  putSession({ ...INITIAL_SESSION_STATE, ...stateOverrides }, dispatch)
  render(<ProfileCard />)
}

describe("ProfileCard", () => {
  it("ひとことプロフィールが無いパックは名前だけ（空の行を置かない）", () => {
    renderProfileCard({
      characterPacks: TWO_PACKS,
      character: characterInfo({ name: "架空の精霊", tagline: undefined }),
    })

    expect(document.querySelector(".profile-card-name")?.textContent).toBe("架空の精霊")
    expect(document.querySelector(".profile-card-tagline")).toBeNull()
  })
})
