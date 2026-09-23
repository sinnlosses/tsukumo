import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { act, cleanup, renderHook } from "@testing-library/react"
import { type ReactElement, type ReactNode } from "react"

import {
  type CharacterEditModel,
  useCharacterEdit,
} from "../../../../src/browser/features/character-screen/hooks/use-character-edit.ts"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/shared/session-state.ts"
import { characterInfo, shownOutfitAccents, shownPortraits } from "../../../fixture/character.ts"
import { type CommandSpy, sessionStoreWith } from "../../session-store.ts"

/**
 * 立ち絵の並び（`<CharacterEdit>`）を描かずに、カード・差し色・背景への畳み方と送り先だけを
 * 測る（docs/design.md 2章「機能の中を分ける」）。画面に出た形は `character-edit.test.tsx`。
 * フィクスチャはすべて手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
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
})

function wrapperFor(
  character: SessionState["character"],
  spy: CommandSpy,
): (props: { readonly children: ReactNode }) => ReactElement {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, character }, spy)
  return function Wrapper({ children }: { readonly children: ReactNode }): ReactElement {
    return <SessionStoreContext.Provider value={store}>{children}</SessionStoreContext.Provider>
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

/** 1つのファイルを選んだ `<input type="file">`（中身は架空の SVG）。 */
function pickedInput(content: string): HTMLInputElement {
  const input = document.createElement("input")
  input.type = "file"
  Object.defineProperty(input, "files", {
    value: [new File([content], "picked.svg", { type: "image/svg+xml" })],
  })
  return input
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
    expect(defaultCard.pickText).toBe("差し替える")
    expect(defaultCard.clear.kind).toBe("hidden")

    expect(cardOf(result.current, "proud").clear).toMatchObject({
      kind: "shown",
      ariaLabel: "どや顔を消す",
    })

    // 畳んだ表では default の絵が入っているが、自分の絵は無いので空きの枠になる。
    const blank = cardOf(result.current, "thinking")
    expect(blank.image).toEqual({ kind: "blank" })
    expect(blank.pickText).toBe("選ぶ")
    expect(blank.pickAriaLabel).toBe("thinkingを選ぶ")
    expect(blank.clear.kind).toBe("hidden")
  })

  it("変えられないパックは disabled になる", () => {
    const { result } = renderHook(() => useCharacterEdit(), {
      wrapper: wrapperFor({ ...FIXTURE_CHARACTER, editable: false }, () => {}),
    })

    expect(ready(result.current).disabled).toBe(true)
  })

  it("消す口は clear-portrait を送る", () => {
    const calls: unknown[] = []
    const { result } = renderHook(() => useCharacterEdit(), {
      wrapper: wrapperFor(FIXTURE_CHARACTER, (command) => calls.push(command)),
    })
    const clear = cardOf(result.current, "proud").clear
    if (clear.kind !== "shown") {
      throw new Error("消す口が出ていない")
    }

    clear.onClear()

    expect(calls).toEqual([{ type: "clear-portrait", expression: "proud" }])
  })

  it("選んだ立ち絵を data URL にして set-portrait を送り、入力欄を空に戻す", async () => {
    const calls: unknown[] = []
    const { result } = renderHook(() => useCharacterEdit(), {
      wrapper: wrapperFor(FIXTURE_CHARACTER, (command) => calls.push(command)),
    })
    const input = pickedInput("<svg/>")

    cardOf(result.current, "proud").onPick(input)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(calls).toEqual([
      {
        type: "set-portrait",
        expression: "proud",
        image: `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`,
      },
    ])
    expect(input.value).toBe("")
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
    expect(heavy().label).toBe("戦闘配置（opus）")
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

    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(calls).toEqual([{ type: "set-outfit-accent", outfit: "heavy", color: "#123456" }])
  })

  it("画面の差し色（仕事）は見た目だけ先に進め、送るのは少し待ってから set-accent", async () => {
    const calls: unknown[] = []
    const { result } = renderHook(() => useCharacterEdit(), {
      wrapper: wrapperFor({ ...FIXTURE_CHARACTER, accent: "#f2b0a0" }, (command) =>
        calls.push(command),
      ),
    })
    expect(ready(result.current).workAccent.value).toBe("#f2b0a0")

    act(() => {
      ready(result.current).workAccent.onChange("#111111")
    })
    act(() => {
      ready(result.current).workAccent.onChange("#123456")
    })
    expect(ready(result.current).workAccent.value).toBe("#123456")
    expect(calls).toEqual([])

    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(calls).toEqual([{ type: "set-accent", target: "work", color: "#123456" }])
  })

  it("chatAccent が無いパックでは、雑談の色見本に仕事の差し色を出し、戻す口は出さない", () => {
    const { result } = renderHook(() => useCharacterEdit(), {
      wrapper: wrapperFor(
        { ...FIXTURE_CHARACTER, accent: "#f2b0a0", chatAccent: undefined },
        () => {},
      ),
    })

    expect(ready(result.current).chatAccent.value).toBe("#f2b0a0")
    expect(ready(result.current).resetChatAccent).toEqual({ kind: "hidden" })
  })

  it("chatAccent があるパックでは、その値を出し、戻す口が clear-chat-accent を送る", () => {
    const calls: unknown[] = []
    const { result } = renderHook(() => useCharacterEdit(), {
      wrapper: wrapperFor(
        { ...FIXTURE_CHARACTER, accent: "#f2b0a0", chatAccent: "#f2984a" },
        (command) => calls.push(command),
      ),
    })

    expect(ready(result.current).chatAccent.value).toBe("#f2984a")
    const reset = ready(result.current).resetChatAccent
    if (reset.kind !== "shown") {
      throw new Error("戻す口が出ていない")
    }

    act(() => {
      reset.onClick()
    })

    expect(calls).toEqual([{ type: "clear-chat-accent" }])
  })

  it("雑談の差し色を変えると、少し待ってから set-accent（target: chat）を送る", async () => {
    const calls: unknown[] = []
    const { result } = renderHook(() => useCharacterEdit(), {
      wrapper: wrapperFor(FIXTURE_CHARACTER, (command) => calls.push(command)),
    })

    act(() => {
      ready(result.current).chatAccent.onChange("#f2984a")
    })
    await new Promise((resolve) => setTimeout(resolve, 250))

    expect(calls).toEqual([{ type: "set-accent", target: "chat", color: "#f2984a" }])
  })

  it("背景の有無を字に畳み、消す口は clear-background を送る", () => {
    const calls: unknown[] = []
    const absent = renderHook(() => useCharacterEdit(), {
      wrapper: wrapperFor(FIXTURE_CHARACTER, () => {}),
    })
    expect(ready(absent.result.current).background).toMatchObject({
      image: { kind: "absent" },
      label: "背景なし",
    })

    const present = renderHook(() => useCharacterEdit(), {
      wrapper: wrapperFor(
        {
          ...FIXTURE_CHARACTER,
          background: { image: "/character/background.png?v=fictional@1", veil: 0.5 },
        },
        (command) => calls.push(command),
      ),
    })
    const background = ready(present.result.current).background
    expect(background).toMatchObject({
      image: { kind: "present", url: "/character/background.png?v=fictional@1" },
      label: "いまの背景",
    })
    background.onClear()
    expect(calls).toEqual([{ type: "clear-background" }])
  })
})
