import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { CharacterCreate } from "../../../../../../../src/browser/components/page/character/components/character-create/character-create.tsx"
import type { CharacterPackEntry } from "../../../../../../../src/shared/character-pack/character.ts"
import { MAX_PORTRAIT_BYTES } from "../../../../../../../src/shared/character-pack/portrait-image.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { characterPackEntry } from "../../../../../../fixture/character.ts"
import { typedElement } from "../../../../../../typed-element.ts"
import { type CommandSpy, putSession, type SentCommand } from "../../../../../session-store.ts"

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
  putSession({ ...INITIAL_SESSION_STATE, characterPacks: packs }, dispatch)
  return <CharacterCreate open={open} onClose={onClose} />
}

/** 開いているかどうかは `<dialog>` の `open` 属性で見る。 */
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
  return typedElement(screen.getByRole("button", { name: "作る" }), HTMLButtonElement, "作るボタン")
}

/**
 * 必須の立ち絵を選ぶ。`FileReader` は非同期なので、決め打ちの時間では負荷の下で読み終わりを
 * 取りこぼす（`aria-label` が「差し替える」に変わる = 読み終わって state が変わった、まで画面で待つ）。
 */
async function pickPortrait(): Promise<void> {
  fireEvent.change(screen.getByLabelText("いつもの顔の立ち絵を選ぶ"), {
    target: { files: [new File(["<svg/>"], "picked.svg", { type: "image/svg+xml" })] },
  })
  await screen.findByLabelText("いつもの顔の立ち絵を差し替える")
}

/** モデルへそのまま渡せる png の立ち絵を選ぶ（svg は canvas で直す経路を通り、happy-dom では描けない）。 */
async function pickPngPortrait(): Promise<void> {
  fireEvent.change(screen.getByLabelText("いつもの顔の立ち絵を選ぶ"), {
    target: { files: [new File(["png"], "picked.png", { type: "image/png" })] },
  })
  await screen.findByLabelText("いつもの顔の立ち絵を差し替える")
}

const PICKED_PNG_DATA_URL = `data:image/png;base64,${Buffer.from("png").toString("base64")}`

/** 生成の手続きが返す欄の値（手で書いた架空のキャラクター）。 */
const GENERATED = {
  id: "fictional-3",
  name: "架空の3号",
  accent: "#123456",
  chatAccent: "#abcdef",
  persona: "# 架空の3号\n\n架空の人格。",
}

function generateButton(): HTMLButtonElement {
  return typedElement(
    screen.getByRole("button", { name: /立ち絵から生成|生成中/u }),
    HTMLButtonElement,
    "生成のボタン",
  )
}

function inputValue(label: string): string {
  const element = screen.getByLabelText(label)
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
    ? element.value
    : ""
}

describe("CharacterCreate", () => {
  it("open が true になると、見出し・立ち絵の口・名前・id・画面の差し色2つを出す", () => {
    render(characterCreate(true, () => {}))

    expect(dialogIsOpen()).toBe(true)
    expect(screen.getByRole("heading", { name: "新しいキャラクター" })).toBeDefined()
    expect(screen.getByLabelText("いつもの顔の立ち絵を選ぶ")).toBeDefined()
    expect(screen.getByLabelText("名前")).toBeDefined()
    expect(screen.getByLabelText("id")).toBeDefined()
    expect(screen.getByLabelText("仕事")).toBeDefined()
    expect(screen.getByLabelText("雑談")).toBeDefined()
    expect(screen.getByLabelText("人格")).toBeDefined()
    expect(screen.getByRole("button", { name: "立ち絵から生成" })).toBeDefined()
  })

  it("id・必須の立ち絵がそろうまで「作る」を押せない", async () => {
    render(characterCreate(true, () => {}))
    expect(submitButton().getAttribute("aria-disabled")).toBe("true")

    fireEvent.change(screen.getByLabelText("id"), { target: { value: "fictional-2" } })
    expect(submitButton().getAttribute("aria-disabled")).toBe("true")
    expect(document.querySelector(".character-screen-note")).toBeNull()
    expect(screen.getByText(/保存するフォルダの名前になります/u)).toBeDefined()

    await pickPortrait()
    expect(submitButton().getAttribute("aria-disabled")).toBe("false")
  })

  it("2 MiB を超える立ち絵は置かず、上限を言う一言を枠の下に出す。選び直すと消える", async () => {
    render(characterCreate(true, () => {}))
    fireEvent.change(screen.getByLabelText("id"), { target: { value: "fictional-2" } })

    fireEvent.change(screen.getByLabelText("いつもの顔の立ち絵を選ぶ"), {
      target: {
        files: [
          new File([new Uint8Array(MAX_PORTRAIT_BYTES + 1)], "big.png", { type: "image/png" }),
        ],
      },
    })

    expect(await screen.findByText(/2 MiB までの画像/u)).toBeDefined()
    expect(screen.getByLabelText("いつもの顔の立ち絵を選ぶ")).toBeDefined()
    expect(submitButton().getAttribute("aria-disabled")).toBe("true")

    await pickPortrait()
    expect(screen.queryByText(/2 MiB までの画像/u)).toBeNull()
  })

  // id はディレクトリ名になるので、送る前に画面で止める（docs/architecture/character-pack.md「画面から作るときの置き場と受け取り方」）。
  it("形の合わない id では押せず、理由を id の欄の下に出す", async () => {
    render(characterCreate(true, () => {}))
    fireEvent.change(screen.getByLabelText("id"), { target: { value: "../escape" } })
    await pickPortrait()

    expect(submitButton().getAttribute("aria-disabled")).toBe("true")
    expect(document.querySelector(".character-screen-note")?.textContent).toContain("英数字")
  })

  it("既にある id では押せず、使われていることを出す", async () => {
    render(characterCreate(true, () => {}))
    fireEvent.change(screen.getByLabelText("id"), { target: { value: "fictional" } })
    await pickPortrait()

    expect(submitButton().getAttribute("aria-disabled")).toBe("true")
    expect(document.querySelector(".character-screen-note")?.textContent).toContain(
      "もう使われている",
    )
  })

  it("そろった状態で押すと、名前・id・立ち絵・画面の差し色2つを載せた characterPack.create を dispatch する", async () => {
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
        procedure: "characterPack.create",
        id: "fictional-2",
        name: "架空の2号",
        portraits: {
          default: `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`,
        },
        accent: "#22ff88",
        chatAccent: "#ff8822",
        persona: "",
      },
    ])
  })

  it("作れたら一覧でそのパックを選んだ状態にして、閉じたことを知らせる", async () => {
    const closed: string[] = []
    render(
      characterCreate(true, () => {
        closed.push("closed")
      }),
    )
    fireEvent.change(screen.getByLabelText("id"), { target: { value: "fictional-2" } })
    await pickPortrait()

    fireEvent.click(submitButton())

    await waitFor(() => {
      expect(closed).toEqual(["closed"])
    })
    expect(window.location.hash).toBe("#character?pack=fictional-2")
  })

  it("断られたら閉じず、失敗を id の欄の下に出す。id を打ち直すと消える", async () => {
    const closed: string[] = []
    render(
      characterCreate(
        true,
        () => {
          closed.push("closed")
        },
        () => Promise.reject(new Error("断り")),
      ),
    )
    fireEvent.change(screen.getByLabelText("id"), { target: { value: "fictional-2" } })
    await pickPortrait()

    fireEvent.click(submitButton())

    await screen.findByText(/作れなかった/u)
    expect(closed).toEqual([])
    expect(window.location.hash).toBe("")
    expect(submitButton().getAttribute("aria-disabled")).toBe("false")

    fireEvent.change(screen.getByLabelText("id"), { target: { value: "fictional-3" } })
    expect(screen.queryByText(/作れなかった/u)).toBeNull()
  })

  it("結果が返るまで、続けて押しても1回しか送らない", async () => {
    const calls: unknown[] = []
    render(
      characterCreate(
        true,
        () => {},
        (command) => {
          calls.push(command)
          return new Promise(() => {})
        },
      ),
    )
    fireEvent.change(screen.getByLabelText("id"), { target: { value: "fictional-2" } })
    await pickPortrait()

    fireEvent.click(submitButton())
    fireEvent.click(submitButton())

    expect(calls).toHaveLength(1)
  })

  it("立ち絵を置くまで「立ち絵から生成」を押せず、置いただけでは生成しない", async () => {
    const calls: unknown[] = []
    render(
      characterCreate(
        true,
        () => {},
        (command) => calls.push(command),
      ),
    )
    expect(generateButton().getAttribute("aria-disabled")).toBe("true")

    await pickPngPortrait()

    expect(generateButton().getAttribute("aria-disabled")).toBe("false")
    expect(calls).toEqual([])
  })

  it("押すと立ち絵を送って欄を埋め、直したあと「作る」で人格を載せて送る", async () => {
    const calls: SentCommand[] = []
    render(
      characterCreate(
        true,
        () => {},
        (command) => {
          calls.push(command)
          return command.procedure === "characterPack.generateFromPortrait" ? GENERATED : undefined
        },
      ),
    )
    await pickPngPortrait()

    fireEvent.click(generateButton())

    await waitFor(() => {
      expect(inputValue("id")).toBe("fictional-3")
    })
    expect(inputValue("名前")).toBe("架空の3号")
    expect(inputValue("仕事")).toBe("#123456")
    expect(inputValue("雑談")).toBe("#abcdef")
    expect(inputValue("人格")).toBe("# 架空の3号\n\n架空の人格。")

    fireEvent.change(screen.getByLabelText("名前"), { target: { value: "直した名前" } })
    fireEvent.click(submitButton())

    expect(calls).toEqual([
      { procedure: "characterPack.generateFromPortrait", portrait: PICKED_PNG_DATA_URL },
      {
        procedure: "characterPack.create",
        id: "fictional-3",
        name: "直した名前",
        portraits: { default: PICKED_PNG_DATA_URL },
        accent: "#123456",
        chatAccent: "#abcdef",
        persona: "# 架空の3号\n\n架空の人格。",
      },
    ])
  })

  it("生成中は「生成中…」になり、「作る」も押せない", async () => {
    const calls: unknown[] = []
    render(
      characterCreate(
        true,
        () => {},
        (command) => {
          calls.push(command)
          return new Promise(() => {})
        },
      ),
    )
    fireEvent.change(screen.getByLabelText("id"), { target: { value: "fictional-2" } })
    await pickPngPortrait()

    fireEvent.click(generateButton())
    fireEvent.click(generateButton())

    await screen.findByRole("button", { name: "生成中…" })
    expect(generateButton().getAttribute("aria-disabled")).toBe("true")
    expect(submitButton().getAttribute("aria-disabled")).toBe("true")
    expect(calls).toHaveLength(1)
  })

  it("生成を断られたら知らせを出し、打ってあった欄と立ち絵は残る", async () => {
    render(
      characterCreate(
        true,
        () => {},
        () => Promise.reject(new Error("断り")),
      ),
    )
    fireEvent.change(screen.getByLabelText("名前"), { target: { value: "架空の2号" } })
    fireEvent.change(screen.getByLabelText("id"), { target: { value: "fictional-2" } })
    await pickPngPortrait()

    fireEvent.click(generateButton())

    await screen.findByText(/生成できなかった/u)
    expect(inputValue("名前")).toBe("架空の2号")
    expect(inputValue("id")).toBe("fictional-2")
    expect(screen.getByLabelText("いつもの顔の立ち絵を差し替える")).toBeDefined()
    expect(generateButton().getAttribute("aria-disabled")).toBe("false")
    expect(submitButton().getAttribute("aria-disabled")).toBe("false")
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
    //
    fireEvent(dialog(), new Event("close"))

    expect(closed).toEqual(["closed"])
  })
})
