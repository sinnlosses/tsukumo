import { afterEach, describe, expect, it } from "bun:test"

import { act, cleanup, fireEvent, render, screen, type RenderResult } from "@testing-library/react"
import { type ReactElement } from "react"

import { type CharacterPackChoice } from "../../../../src/protocol/character.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/protocol/session-state.ts"
import { CharacterCreate } from "../../../../src/ui/features/appearance/character-create.tsx"
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
  ],
  portraits: {
    default: "/character/default.svg?v=fictional@1",
    working: "/character/working.svg?v=fictional@1",
    proud: undefined,
    flustered: undefined,
  },
  outfitAccents: {
    default: "#b8c7ff",
    light: undefined,
    normal: undefined,
    heavy: undefined,
  },
  editable: true,
}

const FIXTURE_PACKS: readonly CharacterPackChoice[] = [{ name: "fictional", label: "架空の精霊" }]

afterEach(() => {
  cleanup()
})

function characterCreate(
  character: SessionState["character"],
  dispatch: SessionContextValue["dispatch"] = () => {},
  packs: readonly CharacterPackChoice[] = FIXTURE_PACKS,
): ReactElement {
  const value: SessionContextValue = {
    state: { ...INITIAL_SESSION_STATE, character, characterPacks: packs },
    connection: "open",
    dispatch,
  }
  return (
    <SessionContext.Provider value={value}>
      <CharacterCreate />
    </SessionContext.Provider>
  )
}

function renderCharacterCreate(
  character: SessionState["character"],
  dispatch: SessionContextValue["dispatch"] = () => {},
  packs: readonly CharacterPackChoice[] = FIXTURE_PACKS,
): RenderResult {
  return render(characterCreate(character, dispatch, packs))
}

/**
 * 立ち絵を1枚選ぶ。`FileReader` は非同期なので、読み終わって state が変わるまでを `act()` の
 * 中で待つ（`act` の外で起きる更新の警告を防ぐ）。
 */
async function pickPortrait(label: string, content: string): Promise<void> {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), {
      target: { files: [new File([content], "picked.svg", { type: "image/svg+xml" })] },
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

function submitButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "作る" }) as HTMLButtonElement
}

function typeName(name: string): void {
  fireEvent.change(screen.getByLabelText("名前"), { target: { value: name } })
}

/** 名前・必須の2枚・差し色をそろえる（押せる状態にする）。 */
async function fillForm(name: string): Promise<void> {
  typeName(name)
  await pickPortrait("通常の立ち絵", "<svg/>")
  await pickPortrait("作業中の立ち絵", "<svg>working</svg>")
}

describe("CharacterCreate", () => {
  it("名前・必須の2枚の立ち絵・差し色の口を出す（表情のラベルは定義の言葉）", () => {
    renderCharacterCreate(FIXTURE_CHARACTER)

    expect(screen.getByLabelText("名前")).toBeDefined()
    expect(screen.getByLabelText("通常の立ち絵")).toBeDefined()
    expect(screen.getByLabelText("作業中の立ち絵")).toBeDefined()
    expect(screen.getByLabelText("差し色")).toBeDefined()
    // 足せる表情は必須の2つだけ（`proud` などは作ったあと「立ち絵」の口から足す）。
    expect(screen.queryByLabelText("proudの立ち絵")).toBeNull()
  })

  it("名前と必須の2枚がそろうまで「作る」を押せない", async () => {
    renderCharacterCreate(FIXTURE_CHARACTER)
    expect(submitButton().disabled).toBe(true)

    typeName("fictional-2")
    expect(submitButton().disabled).toBe(true)

    await pickPortrait("通常の立ち絵", "<svg/>")
    // `working` がまだ無い（片方だけのパックは作らせない）。
    expect(submitButton().disabled).toBe(true)

    await pickPortrait("作業中の立ち絵", "<svg>working</svg>")
    expect(submitButton().disabled).toBe(false)
  })

  // **名前はディレクトリ名になる**ので、送る前に画面で止める（docs/design.md 7.1）。
  it("パスの区切りや `..` を含む名前では押せず、理由を出す", async () => {
    renderCharacterCreate(FIXTURE_CHARACTER)
    await fillForm("../escape")

    expect(submitButton().disabled).toBe(true)
    expect(document.querySelector(".appearance-note")?.textContent).toContain("英数字")

    typeName("nested/name")
    expect(submitButton().disabled).toBe(true)

    typeName("fictional-2")
    expect(submitButton().disabled).toBe(false)
    expect(document.querySelector(".appearance-note")).toBeNull()
  })

  it("既にある名前では押せず、使われていることを出す", async () => {
    renderCharacterCreate(FIXTURE_CHARACTER)
    await fillForm("fictional")

    expect(submitButton().disabled).toBe(true)
    expect(document.querySelector(".appearance-note")?.textContent).toContain("もう使われている")
  })

  it("そろった状態で押すと、名前・必須の2枚・差し色を載せた create-character を dispatch する", async () => {
    const calls: unknown[] = []
    renderCharacterCreate(FIXTURE_CHARACTER, (command) => calls.push(command))
    await fillForm("fictional-2")
    fireEvent.change(screen.getByLabelText("差し色"), { target: { value: "#22ff88" } })

    fireEvent.click(submitButton())

    expect(calls).toEqual([
      {
        type: "create-character",
        name: "fictional-2",
        portraits: {
          default: `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`,
          working: `data:image/svg+xml;base64,${Buffer.from("<svg>working</svg>").toString("base64")}`,
        },
        accent: "#22ff88",
      },
    ])
  })

  it("送った名前が一覧に出たら、作れたことを出す（切り替えは一覧から）", async () => {
    const view = renderCharacterCreate(FIXTURE_CHARACTER)
    await fillForm("fictional-2")
    fireEvent.click(submitButton())

    // まだ `character-changed` が戻っていないので、一覧には出ていない。
    expect(document.querySelector(".appearance-note")).toBeNull()

    // 選択肢の増えたイベントが届いたあと。
    view.rerender(
      characterCreate(FIXTURE_CHARACTER, () => {}, [
        ...FIXTURE_PACKS,
        { name: "fictional-2", label: "fictional-2" },
      ]),
    )

    expect(document.querySelector(".appearance-note")?.textContent).toContain("切り替えられる")
    // 同じ名前でもう一度は作れない。
    expect(submitButton().disabled).toBe(true)
  })

  it("キャラクターが届く前は何も出さない", () => {
    renderCharacterCreate(undefined)

    expect(document.querySelectorAll("fieldset")).toHaveLength(0)
  })
})
