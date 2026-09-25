import { afterEach, describe, expect, it } from "bun:test"

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { type ReactElement } from "react"

import { CharacterCreate } from "../../../../../src/browser/components/page/character/character-create.tsx"
import { SessionStoreContext } from "../../../../../src/browser/stores/session.tsx"
import { type CharacterPackEntry } from "../../../../../src/shared/character.ts"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session-state.ts"
import { characterPackEntry } from "../../../../fixture/character.ts"
import { type CommandSpy, sessionStoreWith } from "../../../session-store.ts"

// 手で書いた架空のキャラクターパック（docs/coding-standards.md「会話内容の扱い」）。
const FIXTURE_PACKS: readonly CharacterPackEntry[] = [characterPackEntry("fictional", "架空の精霊")]

afterEach(() => {
  cleanup()
  window.location.hash = ""
})

function characterCreate(
  open: boolean,
  onClose: () => void,
  dispatch: CommandSpy = () => {},
  packs: readonly CharacterPackEntry[] = FIXTURE_PACKS,
): ReactElement {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, characterPacks: packs }, dispatch)
  return (
    <SessionStoreContext.Provider value={store}>
      <CharacterCreate open={open} onClose={onClose} />
    </SessionStoreContext.Provider>
  )
}

/** 開いているかどうかは `<dialog>` の `open` 属性で見る（`task-board.test.tsx` と同じ）。 */
function dialogIsOpen(): boolean {
  return document.querySelector("dialog.character-create-dialog")?.hasAttribute("open") === true
}

function dialog(): Element {
  const found = document.querySelector("dialog.character-create-dialog")
  if (found === null) {
    throw new Error("ダイアログが描かれていない")
  }
  return found
}

function submitButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "作る" }) as HTMLButtonElement
}

/** 必須の立ち絵を選ぶ。`FileReader` は非同期なので、読み終わって state が変わるまで待つ。 */
async function pickPortrait(): Promise<void> {
  await act(async () => {
    fireEvent.change(screen.getByLabelText("いつもの顔の立ち絵を選ぶ"), {
      target: { files: [new File(["<svg/>"], "picked.svg", { type: "image/svg+xml" })] },
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

describe("CharacterCreate", () => {
  it("open が false のときは開かない", () => {
    render(characterCreate(false, () => {}))

    expect(dialogIsOpen()).toBe(false)
  })

  it("open が true になると、見出し・立ち絵の口・名前・id・画面の差し色2つを出す", () => {
    render(characterCreate(true, () => {}))

    expect(dialogIsOpen()).toBe(true)
    expect(screen.getByRole("heading", { name: "新しいキャラクター" })).toBeDefined()
    expect(screen.getByLabelText("いつもの顔の立ち絵を選ぶ")).toBeDefined()
    expect(screen.getByLabelText("名前")).toBeDefined()
    expect(screen.getByLabelText("id")).toBeDefined()
    expect(screen.getByLabelText("仕事")).toBeDefined()
    expect(screen.getByLabelText("雑談")).toBeDefined()
  })

  it("id・必須の立ち絵がそろうまで「作る」を押せない", async () => {
    render(characterCreate(true, () => {}))
    expect(submitButton().disabled).toBe(true)

    fireEvent.change(screen.getByLabelText("id"), { target: { value: "fictional-2" } })
    expect(submitButton().disabled).toBe(true)

    await pickPortrait()
    expect(submitButton().disabled).toBe(false)
  })

  // **id はディレクトリ名になる**ので、送る前に画面で止める（docs/design.md 7.1）。
  it("形の合わない id では押せず、理由を id の欄の下に出す", async () => {
    render(characterCreate(true, () => {}))
    fireEvent.change(screen.getByLabelText("id"), { target: { value: "../escape" } })
    await pickPortrait()

    expect(submitButton().disabled).toBe(true)
    expect(document.querySelector(".character-screen-note")?.textContent).toContain("英数字")
  })

  it("既にある id では押せず、使われていることを出す", async () => {
    render(characterCreate(true, () => {}))
    fireEvent.change(screen.getByLabelText("id"), { target: { value: "fictional" } })
    await pickPortrait()

    expect(submitButton().disabled).toBe(true)
    expect(document.querySelector(".character-screen-note")?.textContent).toContain(
      "もう使われている",
    )
  })

  it("そろった状態で押すと、名前・id・立ち絵・画面の差し色2つを載せた create-character を dispatch する", async () => {
    const calls: unknown[] = []
    render(
      characterCreate(
        true,
        () => {},
        (command) => calls.push(command),
      ),
    )
    fireEvent.change(screen.getByLabelText("名前"), { target: { value: "架空の2号" } })
    fireEvent.change(screen.getByLabelText("id"), { target: { value: "fictional-2" } })
    fireEvent.change(screen.getByLabelText("仕事"), { target: { value: "#22ff88" } })
    fireEvent.change(screen.getByLabelText("雑談"), { target: { value: "#ff8822" } })
    await pickPortrait()

    fireEvent.click(submitButton())

    expect(calls).toEqual([
      {
        type: "create-character",
        id: "fictional-2",
        name: "架空の2号",
        portraits: {
          default: `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`,
        },
        accent: "#22ff88",
        chatAccent: "#ff8822",
      },
    ])
  })

  it("「やめる」で閉じる", () => {
    const closed: string[] = []
    render(
      characterCreate(true, () => {
        closed.push("closed")
      }),
    )

    fireEvent.click(screen.getByRole("button", { name: "やめる" }))

    expect(closed).toEqual(["closed"])
  })

  it("Esc で閉じる（ブラウザが <dialog> を閉じて投げる close を受けて呼び出し元へ知らせる）", () => {
    const closed: string[] = []
    render(
      characterCreate(true, () => {
        closed.push("closed")
      }),
    )

    // happy-dom はキーの既定の動作を持たないので、その結果の close を直接起こす
    // （speech-log.test.tsx と同じ）。
    fireEvent(dialog(), new Event("close"))

    expect(closed).toEqual(["closed"])
  })

  it("外側（backdrop）のクリックで閉じ、中身のクリックでは閉じない", () => {
    const closed: string[] = []
    render(
      characterCreate(true, () => {
        closed.push("closed")
      }),
    )

    fireEvent.click(screen.getByRole("heading", { name: "新しいキャラクター" }))
    expect(closed).toEqual([])

    fireEvent.click(dialog())
    expect(closed).toEqual(["closed"])
  })
})
