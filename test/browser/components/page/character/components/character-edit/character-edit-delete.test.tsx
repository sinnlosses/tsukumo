import { fireEvent, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { CharacterPackEntry } from "../../../../../../../src/shared/character-pack/character.ts"
import type { SessionState } from "../../../../../../../src/shared/session/session-state.ts"
import { characterInfo, characterPackEntry } from "../../../../../../fixture/character.ts"
import {
  deleteConfirmDialog,
  FIXTURE_CHARACTER,
  renderCharacterEdit,
  setUpCharacterEditScreen,
} from "./character-edit-screen.tsx"

describe("CharacterEdit のキャラクターを消す", () => {
  setUpCharacterEditScreen()

  // このキャラクターを消す帯とその確かめ（docs/architecture/screen-design/character-screen.md「このキャラクターを消す」）。
  describe("このキャラクターを消す", () => {
    it("removal が none なら帯を出さない", () => {
      renderCharacterEdit(FIXTURE_CHARACTER, () => {}, [
        characterPackEntry("fictional", "架空の精霊", { inUse: true, removal: "none" }),
      ])

      expect(document.querySelector(".character-delete-band")).toBeNull()
    })

    it("使用中のパックは帯のボタンが押せない", () => {
      renderCharacterEdit(FIXTURE_CHARACTER, () => {}, [
        characterPackEntry("fictional", "架空の精霊", { inUse: true, removal: "delete" }),
      ])

      expect(
        screen.getByRole("button", { name: /架空の精霊 を消す/ }).getAttribute("aria-disabled"),
      ).toBe("true")
    })

    // 使用中以外のパックを詳しい設定に出すには、一覧にもう1件（`other`）を足し、hash でそれを
    // 選ぶ（`docs/architecture/screen-design/character-screen.md`「選んでいるパックは hash に持つ」）。
    const OTHER_CHARACTER: NonNullable<SessionState["character"]> = characterInfo({
      pack: "other",
      name: "別の精霊",
    })
    const OTHER_PACKS: readonly CharacterPackEntry[] = [
      characterPackEntry("fictional", "架空の精霊", { inUse: true, removal: "none" }),
      characterPackEntry("other", "別の精霊", {
        character: OTHER_CHARACTER,
        inUse: false,
        removal: "delete",
      }),
    ]

    function selectOther(): void {
      window.location.hash = "#character?pack=other"
    }

    it("押すと確かめのダイアログを開き、id が違うと「消す」が押せない", () => {
      selectOther()
      renderCharacterEdit(FIXTURE_CHARACTER, () => {}, OTHER_PACKS)

      fireEvent.click(screen.getByRole("button", { name: /別の精霊 を消す/ }))

      const dialog = deleteConfirmDialog()
      expect(dialog?.hasAttribute("open")).toBe(true)
      expect(screen.getByText("別の精霊 を消しますか？")).toBeDefined()
      const okButton = screen.getByRole("button", { name: "消す" })
      expect(okButton.getAttribute("aria-disabled")).toBe("true")

      fireEvent.change(screen.getByLabelText("確かめのため、id を入力してください"), {
        target: { value: "othe" },
      })
      expect(okButton.getAttribute("aria-disabled")).toBe("true")
    })

    it("id が完全に一致すると「消す」が押せ、characterPack.delete を1回だけ送って閉じる", () => {
      selectOther()
      const calls: unknown[] = []
      renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command), OTHER_PACKS)

      fireEvent.click(screen.getByRole("button", { name: /別の精霊 を消す/ }))
      fireEvent.change(screen.getByLabelText("確かめのため、id を入力してください"), {
        target: { value: "other" },
      })
      const okButton = screen.getByRole("button", { name: "消す" })
      expect(okButton.getAttribute("aria-disabled")).toBe("false")

      fireEvent.click(okButton)

      expect(calls).toEqual([{ procedure: "characterPack.delete", pack: "other" }])
      expect(deleteConfirmDialog()).toBeNull()
    })

    it("「やめる」で閉じ、何も送らない", () => {
      selectOther()
      const calls: unknown[] = []
      renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command), OTHER_PACKS)

      fireEvent.click(screen.getByRole("button", { name: /別の精霊 を消す/ }))
      fireEvent.click(screen.getByRole("button", { name: "やめる" }))

      expect(calls).toEqual([])
      expect(deleteConfirmDialog()).toBeNull()
    })
  })
})
