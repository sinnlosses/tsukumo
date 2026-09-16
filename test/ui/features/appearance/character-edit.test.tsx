import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/protocol/session-state.ts"
import { CharacterEdit } from "../../../../src/ui/features/appearance/character-edit.tsx"
import { SessionContext, type SessionContextValue } from "../../../../src/ui/stores/session.tsx"

// 手で書いた架空のキャラクターパック（docs/coding-standards.md「会話内容の扱い」）。
const FIXTURE_CHARACTER: NonNullable<SessionState["character"]> = {
  pack: "fictional",
  name: "架空の精霊",
  accent: undefined,
  speechMarker: undefined,
  expressions: [
    { name: "default", label: "通常" },
    { name: "working", label: "作業中" },
    { name: "proud", label: "どや顔" },
  ],
  portraits: {
    default: "/character/default.svg?v=fictional@1",
    working: "/character/working.svg?v=fictional@1",
    proud: "/character/proud.svg?v=fictional@1",
    flustered: undefined,
  },
  outfitAccents: {
    default: "#b8c7ff",
    light: undefined,
    normal: undefined,
    heavy: "#ffb3a7",
  },
  editable: true,
}

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

function renderCharacterEdit(
  character: SessionState["character"],
  dispatch: SessionContextValue["dispatch"] = () => {},
): void {
  const value: SessionContextValue = {
    state: { ...INITIAL_SESSION_STATE, character },
    connection: "open",
    dispatch,
  }
  render(
    <SessionContext.Provider value={value}>
      <CharacterEdit />
    </SessionContext.Provider>,
  )
}

describe("CharacterEdit", () => {
  it("4つの表情ぶんの立ち絵の口と、4つの衣装ぶんの差し色を出す", () => {
    renderCharacterEdit(FIXTURE_CHARACTER)

    // ラベルはキャラクター定義の言葉。定義に無い表情（flustered）は表情名がそのまま出る。
    expect(screen.getByLabelText("通常")).toBeDefined()
    expect(screen.getByLabelText("作業中")).toBeDefined()
    expect(screen.getByLabelText("どや顔")).toBeDefined()
    expect(screen.getByLabelText("flustered")).toBeDefined()
    expect(screen.getByLabelText("既定")).toBeDefined()
    expect(screen.getByLabelText("軽装（haiku）")).toBeDefined()
    expect(screen.getByLabelText("通常装備（sonnet）")).toBeDefined()
    expect(screen.getByLabelText("戦闘配置（opus）")).toBeDefined()
  })

  // **必須の2つは消せない**（`docs/requirements.md` 4.4）。画面にも口を出さない。
  it("default と working には消す口を出さない（立ち絵があっても）", () => {
    renderCharacterEdit(FIXTURE_CHARACTER)

    expect(screen.queryByRole("button", { name: "通常を消す" })).toBeNull()
    expect(screen.queryByRole("button", { name: "作業中を消す" })).toBeNull()
    expect(screen.getByRole("button", { name: "どや顔を消す" })).toBeDefined()
  })

  it("立ち絵が無い表情には消す口を出さない", () => {
    renderCharacterEdit(FIXTURE_CHARACTER)

    expect(screen.queryByRole("button", { name: "flusteredを消す" })).toBeNull()
  })

  it("消す口を押すと clear-portrait を dispatch する", () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))

    fireEvent.click(screen.getByRole("button", { name: "どや顔を消す" }))

    expect(calls).toEqual([{ type: "clear-portrait", expression: "proud" }])
  })

  it("立ち絵を選ぶと data URL を載せた set-portrait を dispatch し、入力欄を空に戻す", async () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))
    const input = screen.getByLabelText("どや顔") as HTMLInputElement

    fireEvent.change(input, {
      target: { files: [new File(["<svg/>"], "picked.svg", { type: "image/svg+xml" })] },
    })
    // FileReader は非同期なので、dispatch まで1拍待つ。
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(calls).toEqual([
      {
        type: "set-portrait",
        expression: "proud",
        image: `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`,
      },
    ])
    // 同じファイルをもう一度選べるように戻している。
    expect(input.value).toBe("")
  })

  it("差し色を変えると set-outfit-accent を dispatch する", () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))

    fireEvent.change(screen.getByLabelText("戦闘配置（opus）"), { target: { value: "#123456" } })

    expect(calls).toEqual([{ type: "set-outfit-accent", outfit: "heavy", color: "#123456" }])
  })

  it("差し色の初期値は、その衣装の値 → default → --accent の順で決まる", () => {
    renderCharacterEdit(FIXTURE_CHARACTER)

    // 定義にある衣装はその値。
    expect((screen.getByLabelText("戦闘配置（opus）") as HTMLInputElement).value).toBe("#ffb3a7")
    // 定義に無い衣装は default に落ちる（立ち絵に効くのと同じ解き方）。
    expect((screen.getByLabelText("軽装（haiku）") as HTMLInputElement).value).toBe("#b8c7ff")
  })

  it("差し色がまったく無いパックでは、--accent の値を初期値にする（JS 側に既定の色を持たない）", () => {
    renderCharacterEdit({
      ...FIXTURE_CHARACTER,
      outfitAccents: { default: undefined, light: undefined, normal: undefined, heavy: undefined },
    })

    expect((screen.getByLabelText("既定") as HTMLInputElement).value).toBe("#f2b0a0")
  })

  it("画面から変えられないパックでは、口を出すが操作できない（理由も出す）", () => {
    renderCharacterEdit({ ...FIXTURE_CHARACTER, editable: false })

    expect((screen.getByLabelText("通常") as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText("既定") as HTMLInputElement).disabled).toBe(true)
    expect(document.querySelector(".appearance-note")?.textContent).toContain("characters/local")
  })

  it("キャラクターが届く前は何も出さない", () => {
    renderCharacterEdit(undefined)

    expect(document.querySelectorAll("fieldset")).toHaveLength(0)
  })
})
