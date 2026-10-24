import { fireEvent, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { EXPRESSIONS } from "../../../../../../../src/shared/character-pack/expression.ts"
import type { SessionState } from "../../../../../../../src/shared/session/session-state.ts"
import { shownPortraits } from "../../../../../../fixture/character.ts"
import { typedElement } from "../../../../../../typed-element.ts"
import {
  clearConfirmDialog,
  FIXTURE_CHARACTER,
  renderCharacterEdit,
  setUpCharacterEditScreen,
} from "./character-edit-screen.tsx"

// 立ち絵があるのはこの3つだけ（残りの表情は空の枠として並ぶ。数を見るテストがある）。
const EXPRESSIONS_WITH_PORTRAIT = ["default", "thinking", "proud"] as const

type ImageFieldCase = {
  label: string
  kind: "Background" | "Face" | "Mini"
  blankSelector: string
  blankText: string
  alt: string
  url: string
  present: (url: string) => Partial<NonNullable<SessionState["character"]>>
}

const IMAGE_FIELDS = [
  {
    label: "背景",
    kind: "Background",
    blankSelector: ".character-background-blank",
    blankText: "背景なし",
    alt: "いまの背景",
    url: "/character/background.png?v=fictional@1",
    present: (url: string) => ({ background: { image: url, veil: 0.75 } }),
  },
  {
    label: "顔",
    kind: "Face",
    blankSelector: ".character-face-field-blank",
    blankText: "顔なし",
    alt: "いまの顔",
    url: "/character/face.png?v=fictional@1",
    present: (url: string) => ({ face: url }),
  },
  {
    label: "ミニ立ち絵",
    kind: "Mini",
    blankSelector: ".character-mini-field-blank",
    blankText: "いつもの立ち絵を縮めて使う",
    alt: "いまのミニ立ち絵",
    url: "/character/mini.png?v=fictional@1",
    present: (url: string) => ({ mini: url, hasOwnMini: true }),
  },
] satisfies readonly ImageFieldCase[]

describe("CharacterEdit", () => {
  setUpCharacterEditScreen()

  // 必須の1つ（default）は消せない（`docs/requirements.md`「キャラクターパック」）。画面にも口を出さない。
  it("default には消す口を出さない（立ち絵があっても）", () => {
    renderCharacterEdit(FIXTURE_CHARACTER)

    expect(screen.queryByRole("button", { name: "通常を消す" })).toBeNull()
    expect(screen.getByRole("button", { name: "どや顔を消す" })).toBeDefined()
  })

  // 必須から外れたので、thinking は立ち絵があれば消せる（`isRemovableExpression`）。
  it("thinking は立ち絵があれば消す口を出す", () => {
    renderCharacterEdit(FIXTURE_CHARACTER)

    expect(screen.getByRole("button", { name: "作業中を消す" })).toBeDefined()
  })

  // 立ち絵が無い表情は、その表情の名前を書いた点線の空欄
  // （docs/architecture/screen-design/character-screen.md「立ち絵がまだ無い表情は、その表情の名前を書いた点線の空欄」）。
  it("立ち絵が無い表情は名前つきの空欄で出し、消す口は出さない", () => {
    renderCharacterEdit(FIXTURE_CHARACTER)

    expect(screen.queryByRole("button", { name: "flusteredを消す" })).toBeNull()
    // 空欄の枠そのものが選ぶ口で、どの表情かは枠の字に出る。
    const pick = screen.getByLabelText("flusteredを選ぶ")
    expect(pick.closest("label")?.textContent).toContain("flustered")
    // 立ち絵がある3つ以外の残り全部（EXPRESSIONS が伸びてもここは自動で追随する）。
    const blanks = [...document.querySelectorAll(".character-card-blank")]
    expect(blanks).toHaveLength(EXPRESSIONS.length - EXPRESSIONS_WITH_PORTRAIT.length)
    const withPortrait: readonly string[] = EXPRESSIONS_WITH_PORTRAIT
    expect(blanks.map((blank) => blank.getAttribute("data-expression"))).toEqual(
      EXPRESSIONS.filter((expression) => !withPortrait.includes(expression)),
    )
  })

  it("9つそろうと空欄は出ない", () => {
    renderCharacterEdit({
      ...FIXTURE_CHARACTER,
      ...shownPortraits({
        default: "/character/default.png?v=fictional@1",
        thinking: "/character/thinking.png?v=fictional@1",
        proud: "/character/proud.png?v=fictional@1",
        flustered: "/character/flustered.png?v=fictional@1",
        serious: "/character/serious.png?v=fictional@1",
        curious: "/character/curious.png?v=fictional@1",
        sad: "/character/sad.png?v=fictional@1",
        excited: "/character/excited.png?v=fictional@1",
        bored: "/character/bored.png?v=fictional@1",
      }),
    })

    expect(document.querySelectorAll(".character-card-blank")).toHaveLength(0)
    expect(document.querySelectorAll(".character-card")).toHaveLength(EXPRESSIONS.length)
  })

  it("default のカードにだけ「いつもの顔」の札を添える", () => {
    renderCharacterEdit(FIXTURE_CHARACTER)

    const badges = [...document.querySelectorAll(".character-card-badge")]
    expect(badges.map((badge) => badge.textContent)).toEqual(["いつもの顔"])
    expect(badges[0]?.closest("figure")?.getAttribute("data-expression")).toBe("default")
  })

  it("カードに画像を落とすと、その表情の characterPack.setPortrait を dispatch する", async () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))
    const blank = screen.getByLabelText("sadを選ぶ").closest("label")
    if (blank === null) {
      throw new Error("空欄のカードが無い")
    }

    fireEvent.drop(blank, {
      dataTransfer: { files: [new File(["png"], "dropped.png", { type: "image/png" })] },
    })

    await waitFor(() => {
      expect(calls).toEqual([
        {
          procedure: "characterPack.setPortrait",
          pack: "fictional",
          expression: "sad",
          image: `data:image/png;base64,${Buffer.from("png").toString("base64")}`,
        },
      ])
    })
  })

  // 消す前の確かめ（docs/architecture/screen-design/character-screen.md「表情を消す前の確かめ」）。
  it("消す口を押しただけでは送らず、確かめの吹き出しを開く", () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))

    fireEvent.click(screen.getByRole("button", { name: "どや顔を消す" }))

    expect(calls).toEqual([])
    expect(clearConfirmDialog()?.hasAttribute("open")).toBe(true)
    expect(screen.getByText("「どや顔」を消しますか？")).toBeDefined()
    // 本文の「代わりに出る表情」の名前もパックのラベル
    // （`resolveExpressionLabel`。AGENTS.md「キャラクターの中身をコードに書かない」）。
    expect(screen.getByText("この表情を使う場面では「通常」が出ます。")).toBeDefined()
  })

  it("確かめの「消す」を押すと characterPack.clearPortrait を1回だけ dispatch し、吹き出しを閉じる", () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))

    fireEvent.click(screen.getByRole("button", { name: "どや顔を消す" }))
    fireEvent.click(screen.getByRole("button", { name: "消す" }))

    expect(calls).toEqual([
      { procedure: "characterPack.clearPortrait", pack: "fictional", expression: "proud" },
    ])
    expect(clearConfirmDialog()).toBeNull()
  })

  it("確かめの「やめる」で閉じ、何も送らない", () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))

    fireEvent.click(screen.getByRole("button", { name: "どや顔を消す" }))
    fireEvent.click(screen.getByRole("button", { name: "やめる" }))

    expect(calls).toEqual([])
    expect(clearConfirmDialog()).toBeNull()
  })

  // Esc は `<dialog>` を閉じて `close` イベントを出す（ブラウザの既定の振る舞い）。
  it("Esc で閉じたときも何も送らない", () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))

    fireEvent.click(screen.getByRole("button", { name: "どや顔を消す" }))
    const dialog = clearConfirmDialog()
    if (dialog === null) {
      throw new Error("確かめが開いていない")
    }
    fireEvent(dialog, new Event("close"))

    expect(calls).toEqual([])
    expect(clearConfirmDialog()).toBeNull()
  })

  it("立ち絵を選ぶと data URL を載せた characterPack.setPortrait を dispatch し、入力欄を空に戻す", async () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))
    const input = typedElement(
      screen.getByLabelText("どや顔を差し替える"),
      HTMLInputElement,
      "どや顔を差し替えるの入力欄",
    )

    fireEvent.change(input, {
      target: { files: [new File(["<svg/>"], "picked.svg", { type: "image/svg+xml" })] },
    })

    // FileReader は非同期なので、dispatch されるまでポーリングで待つ。
    await waitFor(() => {
      expect(calls).toEqual([
        {
          procedure: "characterPack.setPortrait",
          pack: "fictional",
          expression: "proud",
          image: `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`,
        },
      ])
    })
    // 同じファイルをもう一度選べるように戻している。
    expect(input.value).toBe("")
  })

  it("画面から変えられないパックでは、口を出すが操作できない（理由も出す）", () => {
    renderCharacterEdit({ ...FIXTURE_CHARACTER, editable: false })

    expect(
      typedElement(
        screen.getByLabelText("通常を差し替える"),
        HTMLInputElement,
        "通常を差し替えるの入力欄",
      ).disabled,
    ).toBe(true)
    expect(
      typedElement(screen.getByLabelText("仕事"), HTMLInputElement, "仕事の入力欄").disabled,
    ).toBe(true)
    expect(document.querySelector(".character-screen-note")?.textContent).toContain(
      "characters/local",
    )
  })

  // 背景・顔・ミニ立ち絵は同じ `<ImageField>` の口（`docs/architecture/screen-design.md`「背景」「顔」
  // 「ミニ立ち絵」）。差し替える・消すの2つだけで、覆いの濃さのつまみは背景にだけ要らない。
  it.each(IMAGE_FIELDS)(
    "$label が無いパックでは、点線の枠と「$blankText」を出し、消す口は出さない",
    ({ label, blankSelector, blankText, alt }) => {
      renderCharacterEdit(FIXTURE_CHARACTER)

      expect(document.querySelectorAll(blankSelector)).toHaveLength(1)
      expect(screen.getByText(blankText)).toBeDefined()
      expect(screen.getByLabelText(`${label}を差し替える`)).toBeDefined()
      expect(screen.queryByAltText(alt)).toBeNull()
      expect(screen.queryByRole("button", { name: `${label}を消す` })).toBeNull()
    },
  )

  it.each(IMAGE_FIELDS)(
    "$label があるパックでは、いまの画像を小さく出して消す口も出す",
    ({ label, alt, url, present }) => {
      renderCharacterEdit({ ...FIXTURE_CHARACTER, ...present(url) })

      expect(
        typedElement(screen.getByAltText(alt), HTMLImageElement, `${alt}の画像`).getAttribute(
          "src",
        ),
      ).toBe(url)
      expect(screen.getByRole("button", { name: `${label}を消す` })).toBeDefined()
    },
  )

  it.each(IMAGE_FIELDS)(
    "$label を消す口を押すと characterPack.clear$kind を dispatch する",
    ({ label, kind, url, present }) => {
      const calls: unknown[] = []
      renderCharacterEdit({ ...FIXTURE_CHARACTER, ...present(url) }, (command) =>
        calls.push(command),
      )

      fireEvent.click(screen.getByRole("button", { name: `${label}を消す` }))

      expect(calls).toEqual([{ procedure: `characterPack.clear${kind}`, pack: "fictional" }])
    },
  )

  it.each(IMAGE_FIELDS)(
    "$label を選ぶと data URL を載せた characterPack.set$kind を dispatch し、入力欄を空に戻す",
    async ({ label, kind }) => {
      const calls: unknown[] = []
      renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))
      const input = typedElement(
        screen.getByLabelText(`${label}を差し替える`),
        HTMLInputElement,
        `${label}を差し替えるの入力欄`,
      )

      fireEvent.change(input, {
        target: { files: [new File(["png"], "picture.png", { type: "image/png" })] },
      })

      await waitFor(() => {
        expect(calls).toEqual([
          {
            procedure: `characterPack.set${kind}`,
            pack: "fictional",
            image: `data:image/png;base64,${Buffer.from("png").toString("base64")}`,
          },
        ])
      })
      expect(input.value).toBe("")
    },
  )

  it.each([
    ["顔", /顔は SVG・PNG・GIF の 2 MiB までの画像/u],
    ["ミニ立ち絵", /ミニ立ち絵は SVG・PNG・GIF の 2 MiB までの画像/u],
  ])(
    "%sの書き込みが断られたら、欄の下に受け付ける種類と 2 MiB の上限を言う一言を出す",
    async (label, pattern) => {
      renderCharacterEdit(FIXTURE_CHARACTER, () => Promise.reject(new Error("断り")))

      fireEvent.change(screen.getByLabelText(`${label}を差し替える`), {
        target: { files: [new File(["png"], "picture.png", { type: "image/png" })] },
      })

      expect(await screen.findByText(pattern)).toBeDefined()
    },
  )

  // ミニ立ち絵の縮図は定義に `mini` を持つときだけ。`mini` の URL が default に落ちていても持たないことになる。
  it("ミニ立ち絵を持たないパックでは、mini の URL が default に落ちていても点線の枠と一言を出し、消す口は出さない", () => {
    renderCharacterEdit({
      ...FIXTURE_CHARACTER,
      mini: "/character/default.svg?v=1",
      hasOwnMini: false,
    })

    expect(document.querySelectorAll(".character-mini-field-preview")).toHaveLength(0)
    expect(screen.getByText("いつもの立ち絵を縮めて使う")).toBeDefined()
    expect(screen.queryByRole("button", { name: "ミニ立ち絵を消す" })).toBeNull()
  })

  it("縮図を押すと拡大して見られる", () => {
    renderCharacterEdit({
      ...FIXTURE_CHARACTER,
      mini: "/character/mini.png?v=fictional@1",
      hasOwnMini: true,
    })

    fireEvent.click(screen.getByRole("button", { name: "ミニ立ち絵を拡大" }))

    expect(screen.getAllByAltText("いまのミニ立ち絵")).toHaveLength(2)
  })

  it("画面から変えられないパックでは、ミニ立ち絵の差し替える・消すが押せない", () => {
    renderCharacterEdit({
      ...FIXTURE_CHARACTER,
      mini: "/character/mini.png?v=fictional@1",
      hasOwnMini: true,
      editable: false,
    })

    expect(
      typedElement(
        screen.getByLabelText("ミニ立ち絵を差し替える"),
        HTMLInputElement,
        "ミニ立ち絵を差し替えるの入力欄",
      ).disabled,
    ).toBe(true)
    expect(
      screen.getByRole("button", { name: "ミニ立ち絵を消す" }).getAttribute("aria-disabled"),
    ).toBe("true")
  })

  it("立ち絵の書き込みが断られたら、その表情のカードの下に上限を言う一言を出す", async () => {
    renderCharacterEdit(FIXTURE_CHARACTER, () => Promise.reject(new Error("断り")))

    fireEvent.change(screen.getByLabelText("作業中を差し替える"), {
      target: { files: [new File(["png"], "thinking.png", { type: "image/png" })] },
    })

    expect(
      await screen.findByText(/作業中を差し替えられなかった。.*2 MiB までの画像/u),
    ).toBeDefined()
  })

  it("キャラクターが届く前は何も出さない", () => {
    renderCharacterEdit(undefined)

    expect(document.querySelectorAll("section")).toHaveLength(0)
    expect(document.querySelectorAll(".character-gallery")).toHaveLength(0)
  })
})
