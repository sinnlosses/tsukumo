import { act, cleanup, renderHook } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  type CharacterEditModel,
  useCharacterEdit,
} from "../../../../../../../src/browser/components/page/character/components/hooks/use-character-edit.ts"
import type { CharacterPackEntry } from "../../../../../../../src/shared/character-pack/character.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../src/shared/session/session-state.ts"
import {
  characterInfo,
  characterPackEntry,
  shownOutfitAccents,
  shownPortraits,
} from "../../../../../../fixture/character.ts"
import { type CommandSpy, putSession } from "../../../../../session-store.ts"

/**
 * 立ち絵の並び（`<CharacterEdit>`）を描かずに、カード・差し色・背景への畳み方と送り先だけを
 * 測る（docs/architecture.md「機能の中を分ける」）。画面に出た形は別のテストが見る。
 */

const FIXTURE_CHARACTER: NonNullable<SessionState["character"]> = characterInfo({
  expressions: [
    { name: "default", label: "通常" },
    { name: "proud", label: "どや顔" },
  ],
  ...shownPortraits({
    default: "/character/default.png?v=fictional@1",
    proud: "/character/proud.png?v=fictional@1",
  }),
  outfitAccents: shownOutfitAccents({ default: "#b8c7ff" }),
})

let themeStyleElement: HTMLStyleElement | undefined

beforeEach(() => {
  // `--accent` は差し色が定義に無い衣装の初期値として読まれる（theme.css の代役）。
  themeStyleElement = document.createElement("style")
  themeStyleElement.textContent = ":root { --accent: #f2b0a0; }"
  document.head.appendChild(themeStyleElement)
})

afterEach(() => {
  cleanup()
  themeStyleElement?.remove()
  themeStyleElement = undefined
  window.location.hash = ""
})

function wrapperFor(
  character: SessionState["character"],
  spy: CommandSpy,
): (props: { readonly children: ReactNode }) => ReactElement {
  putSession({ ...INITIAL_SESSION_STATE, character }, spy)
  return function Wrapper({ children }: { readonly children: ReactNode }): ReactElement {
    return <>{children}</>
  }
}

/**
 * `removal` を読ませたいテストのための wrapper。`useSelectedPack` は使用中の姿の `removal` を
 * 一覧（`characterPacks`）の同じ名前の1件から引くので、`wrapperFor` と違い一覧も渡す。
 */
function wrapperWithPacks(
  character: SessionState["character"],
  packs: readonly CharacterPackEntry[],
  spy: CommandSpy,
): (props: { readonly children: ReactNode }) => ReactElement {
  putSession({ ...INITIAL_SESSION_STATE, character, characterPacks: packs }, spy)
  return function Wrapper({ children }: { readonly children: ReactNode }): ReactElement {
    return <>{children}</>
  }
}

function ready(model: CharacterEditModel): Extract<CharacterEditModel, { kind: "ready" }> {
  if (model.kind !== "ready") {
    throw new Error("口がまだ決まっていない")
  }
  return model
}

function cardOf(model: CharacterEditModel, expression: string) {
  const card = ready(model).cards.find((candidate) => candidate.expression === expression)
  if (card === undefined) {
    throw new Error(`${expression} のカードが無い`)
  }
  return card
}

describe("useCharacterEdit", () => {
  it("キャラクターが届く前は waiting", () => {
    const { result } = renderHook(() => useCharacterEdit(), {
      wrapper: wrapperFor(undefined, () => {}),
    })

    expect(result.current).toEqual({ kind: "waiting" })
  })

  it("自分の絵を持つ表情だけ絵を出し、default と絵の無い表情には消す口を出さない", () => {
    const { result } = renderHook(() => useCharacterEdit(), {
      wrapper: wrapperFor(FIXTURE_CHARACTER, () => {}),
    })

    const defaultCard = cardOf(result.current, "default")
    expect(defaultCard.image).toEqual({
      kind: "shown",
      url: "/character/default.png?v=fictional@1",
      accent: "#b8c7ff",
      outfit: "default",
    })
    expect(defaultCard.pickAriaLabel).toBe("通常を差し替える")
    expect(defaultCard.badge).toEqual({ kind: "shown", text: "いつもの顔" })
    expect(defaultCard.clear.kind).toBe("hidden")

    expect(cardOf(result.current, "proud").clear).toMatchObject({
      kind: "shown",
      ariaLabel: "どや顔を消す",
    })

    // 畳んだ表では default の絵が入っているが、自分の絵は無いので空きの枠になる。
    const blank = cardOf(result.current, "thinking")
    expect(blank.image).toEqual({ kind: "blank" })
    expect(blank.badge).toEqual({ kind: "none" })
    expect(blank.pickAriaLabel).toBe("thinkingを選ぶ")
    expect(blank.clear.kind).toBe("hidden")
  })

  it("差し色は見た目だけ先に進め、送るのは少し待ってから1回", async () => {
    const calls: unknown[] = []
    const { result } = renderHook(() => useCharacterEdit(), {
      wrapper: wrapperFor(FIXTURE_CHARACTER, (command) => calls.push(command)),
    })
    const heavy = () => {
      const field = ready(result.current).outfitAccents.find((each) => each.outfit === "heavy")
      if (field === undefined) {
        throw new Error("heavy の欄が無い")
      }
      return field
    }
    expect(heavy().label).toBe("戦闘配置")
    expect(heavy().sublabel).toEqual({ kind: "shown", text: "opus" })
    expect(heavy().ariaLabel).toBe("戦闘配置（opus）")
    // 定義は default に畳んである（heavy は default の色）。
    expect(heavy().value).toBe("#b8c7ff")

    act(() => {
      heavy().onChange("#111111")
    })
    act(() => {
      heavy().onChange("#123456")
    })
    expect(heavy().value).toBe("#123456")
    expect(calls).toEqual([])

    await vi.waitFor(() => {
      expect(calls).toEqual([
        {
          procedure: "characterPack.setOutfitAccent",
          pack: "fictional",
          outfit: "heavy",
          color: "#123456",
        },
      ])
    })
  })

  it("画面の差し色（仕事）は見た目だけ先に進める", () => {
    const { result } = renderHook(() => useCharacterEdit(), {
      wrapper: wrapperFor({ ...FIXTURE_CHARACTER, accent: "#f2b0a0" }, () => {}),
    })
    expect(ready(result.current).workAccent.value).toBe("#f2b0a0")

    act(() => {
      ready(result.current).workAccent.onChange("#123456")
    })

    expect(ready(result.current).workAccent.value).toBe("#123456")
  })

  it("雑談の差し色を変えると、少し待ってから characterPack.setAccent（target: chat）を送る", async () => {
    const calls: unknown[] = []
    const { result } = renderHook(() => useCharacterEdit(), {
      wrapper: wrapperFor(FIXTURE_CHARACTER, (command) => calls.push(command)),
    })

    act(() => {
      ready(result.current).chatAccent.onChange("#f2984a")
    })
    await vi.waitFor(() => {
      expect(calls).toEqual([
        {
          procedure: "characterPack.setAccent",
          pack: "fictional",
          target: "chat",
          color: "#f2984a",
        },
      ])
    })
  })

  // このキャラクターを消す／同梱に戻す帯（docs/architecture/screen-design.md「このキャラクターを消す」）。
  it("使用中のパックは帯のボタンが押せない（理由つき）", () => {
    const { result } = renderHook(() => useCharacterEdit(), {
      wrapper: wrapperWithPacks(
        FIXTURE_CHARACTER,
        [characterPackEntry("fictional", "架空の精霊", { inUse: true, removal: "delete" })],
        () => {},
      ),
    })

    const band = ready(result.current).deleteBand
    if (band.kind !== "shown") {
      throw new Error("帯が出ていない")
    }
    expect(band.disabled).toBe(true)
    expect(band.title).toBeDefined()
  })

  // 使用中以外のパックを詳しい設定に出すには、一覧にもう1件（`other`）を足し、hash でそれを
  // 選ぶ（`docs/architecture/screen-design.md`「選んでいるパックは hash に持つ」）。
  it("使用中以外のパックは帯のボタンが押せる", () => {
    window.location.hash = "#character?pack=other"
    const { result } = renderHook(() => useCharacterEdit(), {
      wrapper: wrapperWithPacks(
        FIXTURE_CHARACTER,
        [
          characterPackEntry("fictional", "架空の精霊", { inUse: true, removal: "none" }),
          characterPackEntry("other", "別の精霊", {
            character: characterInfo({ pack: "other", name: "別の精霊" }),
            inUse: false,
            removal: "delete",
          }),
        ],
        () => {},
      ),
    })

    const band = ready(result.current).deleteBand
    if (band.kind !== "shown") {
      throw new Error("帯が出ていない")
    }
    expect(band.pack).toBe("other")
    expect(band.disabled).toBe(false)
    expect(band.heading).toBe("このキャラクターを消す")
  })

  // 名前とプロフィールを変えるダイアログの種（`CharacterProfileEdit`）。
  it("名前・ひとこと無しのパックでは editProfile の種が空文字になる", () => {
    const { result } = renderHook(() => useCharacterEdit(), {
      wrapper: wrapperFor({ ...FIXTURE_CHARACTER, name: undefined, tagline: undefined }, () => {}),
    })

    const edit = ready(result.current).profile.editProfile
    if (edit.kind !== "shown") {
      throw new Error("編集の口が出ていない")
    }
    expect(edit.name).toBe("")
    expect(edit.tagline).toBe("")
  })

  it("変えられないパックでは editProfile を出さない", () => {
    const { result } = renderHook(() => useCharacterEdit(), {
      wrapper: wrapperFor({ ...FIXTURE_CHARACTER, editable: false }, () => {}),
    })

    expect(ready(result.current).profile.editProfile).toEqual({ kind: "hidden" })
  })

  it("同梱を直したパックは「同梱に戻す」の文言になる", () => {
    window.location.hash = "#character?pack=other"
    const { result } = renderHook(() => useCharacterEdit(), {
      wrapper: wrapperWithPacks(
        FIXTURE_CHARACTER,
        [
          characterPackEntry("fictional", "架空の精霊", { inUse: true, removal: "none" }),
          characterPackEntry("other", "別の精霊", {
            character: characterInfo({ pack: "other", name: "別の精霊" }),
            inUse: false,
            removal: "revert-to-bundled",
          }),
        ],
        () => {},
      ),
    })

    const band = ready(result.current).deleteBand
    if (band.kind !== "shown") {
      throw new Error("帯が出ていない")
    }
    expect(band.heading).toBe("同梱に戻す")
    expect(band.okLabel).toBe("同梱に戻す")
    expect(band.dialogHeading).toContain("同梱に戻しますか？")
  })
})
