import { afterEach, describe, expect, it } from "bun:test"

import { act, cleanup, fireEvent, render, screen, type RenderResult } from "@testing-library/react"
import { type ReactElement } from "react"

import { CharacterCreate } from "../../../../src/browser/features/character-screen/character-create.tsx"
import {
  SessionContext,
  type SessionContextValue,
} from "../../../../src/browser/stores/session.tsx"
import { type CharacterPackChoice } from "../../../../src/shared/character.ts"
import { FRAME_ERROR_REASON } from "../../../../src/shared/frame.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/shared/session-state.ts"

// 手で書いた架空のキャラクターパック（docs/coding-standards.md「会話内容の扱い」）。
const FIXTURE_CHARACTER: NonNullable<SessionState["character"]> = {
  pack: "fictional",
  name: "架空の精霊",
  accent: undefined,
  speechMarker: undefined,
  expressions: [
    { name: "default", label: "通常" },
    { name: "thinking", label: "作業中" },
  ],
  portraits: {
    default: "/character/default.svg?v=fictional@1",
    thinking: "/character/thinking.svg?v=fictional@1",
    proud: undefined,
    flustered: undefined,
    serious: undefined,
    curious: undefined,
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
  window.location.hash = ""
})

function characterCreate(
  character: SessionState["character"],
  dispatch: SessionContextValue["dispatch"] = () => {},
  packs: readonly CharacterPackChoice[] = FIXTURE_PACKS,
  turnInProgress = false,
): ReactElement {
  const value: SessionContextValue = {
    state: { ...INITIAL_SESSION_STATE, character, characterPacks: packs, turnInProgress },
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

/** 作ったあとの一覧（送った名前が増えた状態）。 */
function packsWith(name: string): readonly CharacterPackChoice[] {
  return [...FIXTURE_PACKS, { name, label: name }]
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

/** 名前・必須の1枚・差し色をそろえる（押せる状態にする）。 */
async function fillForm(name: string): Promise<void> {
  typeName(name)
  await pickPortrait("通常の立ち絵", "<svg/>")
}

describe("CharacterCreate", () => {
  it("名前・必須の1枚の立ち絵・差し色の口を出す（表情のラベルは定義の言葉）", () => {
    renderCharacterCreate(FIXTURE_CHARACTER)

    expect(screen.getByLabelText("名前")).toBeDefined()
    expect(screen.getByLabelText("通常の立ち絵")).toBeDefined()
    expect(screen.getByLabelText("差し色")).toBeDefined()
    // 足せる表情は必須の1つだけ（`thinking` / `proud` などは作ったあと「立ち絵」の口から足す）。
    expect(screen.queryByLabelText("作業中の立ち絵")).toBeNull()
    expect(screen.queryByLabelText("proudの立ち絵")).toBeNull()
  })

  it("名前と必須の1枚がそろうまで「作る」を押せない", async () => {
    renderCharacterCreate(FIXTURE_CHARACTER)
    expect(submitButton().disabled).toBe(true)

    typeName("fictional-2")
    expect(submitButton().disabled).toBe(true)

    await pickPortrait("通常の立ち絵", "<svg/>")
    expect(submitButton().disabled).toBe(false)
  })

  // **名前はディレクトリ名になる**ので、送る前に画面で止める（docs/design.md 7.1）。
  it("パスの区切りや `..` を含む名前では押せず、理由を出す", async () => {
    renderCharacterCreate(FIXTURE_CHARACTER)
    await fillForm("../escape")

    expect(submitButton().disabled).toBe(true)
    expect(document.querySelector(".character-screen-note")?.textContent).toContain("英数字")

    typeName("nested/name")
    expect(submitButton().disabled).toBe(true)

    typeName("fictional-2")
    expect(submitButton().disabled).toBe(false)
    expect(document.querySelector(".character-screen-note")).toBeNull()
  })

  it("既にある名前では押せず、使われていることを出す", async () => {
    renderCharacterCreate(FIXTURE_CHARACTER)
    await fillForm("fictional")

    expect(submitButton().disabled).toBe(true)
    expect(document.querySelector(".character-screen-note")?.textContent).toContain(
      "もう使われている",
    )
  })

  it("そろった状態で押すと、名前・必須の1枚・差し色を載せた create-character を dispatch する", async () => {
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
        },
        accent: "#22ff88",
      },
    ])
  })

  it("送った名前が一覧に出たら、作れたことと切り替える口を出す", async () => {
    const view = renderCharacterCreate(FIXTURE_CHARACTER)
    await fillForm("fictional-2")
    fireEvent.click(submitButton())

    // まだ `character-changed` が戻っていないので、一覧には出ていない。
    expect(document.querySelector(".character-screen-note")).toBeNull()
    expect(screen.queryByRole("button", { name: "このキャラクターに切り替える" })).toBeNull()

    // 選択肢の増えたイベントが届いたあと。
    view.rerender(characterCreate(FIXTURE_CHARACTER, () => {}, packsWith("fictional-2")))

    expect(document.querySelector(".character-screen-note")?.textContent).toContain("作った")
    expect(screen.getByRole("button", { name: "このキャラクターに切り替える" })).toBeDefined()
    // 同じ名前でもう一度は作れない。
    expect(submitButton().disabled).toBe(true)
  })

  it("切り替える口は switch-character を送り、キャラクター画面へ戻す", async () => {
    const calls: unknown[] = []
    const view = renderCharacterCreate(FIXTURE_CHARACTER, (command) => calls.push(command))
    await fillForm("fictional-2")
    fireEvent.click(submitButton())
    view.rerender(
      characterCreate(
        FIXTURE_CHARACTER,
        (command) => calls.push(command),
        packsWith("fictional-2"),
      ),
    )

    fireEvent.click(screen.getByRole("button", { name: "このキャラクターに切り替える" }))

    expect(calls.at(-1)).toEqual({ type: "switch-character", name: "fictional-2" })
    expect(window.location.hash).toBe("#character")
  })

  // 切り替えは起こし直し（会話が消える）なので、ターン進行中は押せない（サイドバーの
  // `<select>` と同じ理由・同じ文言）。
  it("ターン進行中は切り替える口を押せず、理由を title に出す", async () => {
    const view = renderCharacterCreate(FIXTURE_CHARACTER)
    await fillForm("fictional-2")
    fireEvent.click(submitButton())
    view.rerender(characterCreate(FIXTURE_CHARACTER, () => {}, packsWith("fictional-2"), true))

    const button = screen.getByRole("button", {
      name: "このキャラクターに切り替える",
    }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.title).toBe(FRAME_ERROR_REASON.switchDuringTurn)
  })

  // 作る画面は1枚の画面なので、行き止まりにしない（キャラクターが届く前でも戻れる）。
  it("キャラクターへ戻る口を出す", () => {
    renderCharacterCreate(undefined)

    const back = screen.getByRole("link", { name: "← キャラクターへ戻る" })
    expect(back.getAttribute("href")).toBe("#character")
  })

  it("キャラクターが届く前は何も出さない", () => {
    renderCharacterCreate(undefined)

    expect(document.querySelectorAll("fieldset")).toHaveLength(0)
  })
})
