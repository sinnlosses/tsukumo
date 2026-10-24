import { fireEvent, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { characterPackEntry } from "../../../../../../fixture/character.ts"
import { typedElement } from "../../../../../../typed-element.ts"
import {
  FIXTURE_CHARACTER,
  profileEditDialog,
  renderCharacterEdit,
  setUpCharacterEditScreen,
} from "./character-edit-screen.tsx"

describe("CharacterEdit の名前と人格", () => {
  setUpCharacterEditScreen()

  // 名前と自己紹介文を設定するダイアログ（docs/architecture/screen-design/character-screen.md「名乗り」）。
  describe("名前と自己紹介文を設定する", () => {
    it("押すと、いまの名前とひとことを入れたダイアログを開く", () => {
      renderCharacterEdit({ ...FIXTURE_CHARACTER, name: "架空の精霊", tagline: "気ままな相棒" })

      fireEvent.click(screen.getByRole("button", { name: "名前と自己紹介文を設定する" }))

      expect(profileEditDialog()?.hasAttribute("open")).toBe(true)
      expect(
        typedElement(screen.getByLabelText("名前"), HTMLInputElement, "名前の入力欄").value,
      ).toBe("架空の精霊")
      expect(
        typedElement(screen.getByLabelText("自己紹介文"), HTMLInputElement, "自己紹介文の入力欄")
          .value,
      ).toBe("気ままな相棒")
    })

    it("名前とひとことを書き換えて保存すると、characterPack.setProfile を1回送って閉じる", () => {
      const calls: unknown[] = []
      renderCharacterEdit(
        { ...FIXTURE_CHARACTER, name: "架空の精霊", tagline: "気ままな相棒" },
        (command) => calls.push(command),
      )

      fireEvent.click(screen.getByRole("button", { name: "名前と自己紹介文を設定する" }))
      fireEvent.change(screen.getByLabelText("名前"), { target: { value: "新しい名前" } })
      fireEvent.change(screen.getByLabelText("自己紹介文"), {
        target: { value: "新しいひとこと" },
      })
      fireEvent.click(screen.getByRole("button", { name: "保存する" }))

      expect(calls).toEqual([
        {
          procedure: "characterPack.setProfile",
          pack: "fictional",
          name: "新しい名前",
          tagline: "新しいひとこと",
        },
      ])
      expect(profileEditDialog()).toBeNull()
    })

    it("「やめる」で閉じ、何も送らない", () => {
      const calls: unknown[] = []
      renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))

      fireEvent.click(screen.getByRole("button", { name: "名前と自己紹介文を設定する" }))
      fireEvent.change(screen.getByLabelText("名前"), { target: { value: "触らない名前" } })
      fireEvent.click(screen.getByRole("button", { name: "やめる" }))

      expect(calls).toEqual([])
      expect(profileEditDialog()).toBeNull()
    })

    it("画面から変えられないパックでは口を出さない", () => {
      renderCharacterEdit({ ...FIXTURE_CHARACTER, editable: false })

      expect(screen.queryByRole("button", { name: "名前と自己紹介文を設定する" })).toBeNull()
    })
  })

  describe("プロフィールを設定する", () => {
    const PACKS = [
      characterPackEntry("fictional", "架空の精霊", { inUse: true, personaBody: "# 人格\n\n本文" }),
    ]

    function personaDialog(): Element | null {
      return document.querySelector('dialog[aria-label="プロフィールを設定する"]')
    }

    it("押すと、いまの本文を入れたダイアログを開く", () => {
      renderCharacterEdit(FIXTURE_CHARACTER, () => {}, PACKS)

      fireEvent.click(screen.getByRole("button", { name: "プロフィールを設定する" }))

      expect(personaDialog()?.hasAttribute("open")).toBe(true)
      expect(
        typedElement(screen.getByLabelText("本文"), HTMLTextAreaElement, "本文の入力欄").value,
      ).toBe("# 人格\n\n本文")
    })

    it("書き換えて保存すると、characterPack.setPersona を1回送り、返りを待って閉じる", async () => {
      const calls: unknown[] = []
      let reply: () => void = () => {}
      renderCharacterEdit(
        FIXTURE_CHARACTER,
        (command) => {
          calls.push(command)
          return new Promise<void>((resolve) => {
            reply = resolve
          })
        },
        PACKS,
      )

      fireEvent.click(screen.getByRole("button", { name: "プロフィールを設定する" }))
      fireEvent.change(screen.getByLabelText("本文"), { target: { value: "新しい人格" } })
      fireEvent.click(screen.getByRole("button", { name: "保存する" }))

      expect(calls).toEqual([
        { procedure: "characterPack.setPersona", pack: "fictional", persona: "新しい人格" },
      ])
      // 返る前に閉じると、流し直し前の古い本文で開き直せてしまう。
      expect(personaDialog()).not.toBeNull()

      reply()
      await waitFor(() => {
        expect(personaDialog()).toBeNull()
      })
    })

    it("保存が断られたら閉じない", async () => {
      const calls: unknown[] = []
      renderCharacterEdit(
        FIXTURE_CHARACTER,
        (command) => {
          calls.push(command)
          return Promise.reject(new Error("断られた"))
        },
        PACKS,
      )

      fireEvent.click(screen.getByRole("button", { name: "プロフィールを設定する" }))
      fireEvent.click(screen.getByRole("button", { name: "保存する" }))

      await waitFor(() => {
        expect(calls).toHaveLength(1)
      })
      expect(personaDialog()).not.toBeNull()
    })

    it("「やめる」で閉じ、何も送らない", () => {
      const calls: unknown[] = []
      renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command), PACKS)

      fireEvent.click(screen.getByRole("button", { name: "プロフィールを設定する" }))
      fireEvent.change(screen.getByLabelText("本文"), { target: { value: "触らない" } })
      fireEvent.click(screen.getByRole("button", { name: "やめる" }))

      expect(calls).toEqual([])
      expect(personaDialog()).toBeNull()
    })

    it("画面から変えられないパックでは口を出さない", () => {
      renderCharacterEdit({ ...FIXTURE_CHARACTER, editable: false }, () => {}, PACKS)

      expect(screen.queryByRole("button", { name: "プロフィールを設定する" })).toBeNull()
    })
  })
})
