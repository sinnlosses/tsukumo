import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { CharacterEdit } from "../../../../../src/browser/components/page/character/character-edit.tsx"
import { SessionStoreContext } from "../../../../../src/browser/stores/session.tsx"
import { type CharacterPackEntry } from "../../../../../src/shared/character.ts"
import { EXPRESSIONS } from "../../../../../src/shared/expression.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session-state.ts"
import {
  characterInfo,
  characterPackEntry,
  shownOutfitAccents,
  shownPortraits,
} from "../../../../fixture/character.ts"
import { type CommandSpy, sessionStoreWith } from "../../../session-store.ts"

// **立ち絵があるのはこの3つだけ**（残りの表情は空の枠として並ぶ。数を見るテストがある）。
const EXPRESSIONS_WITH_PORTRAIT = ["default", "thinking", "proud"] as const

// 手で書いた架空のキャラクターパック（docs/coding-standards.md「会話内容の扱い」）。
const FIXTURE_CHARACTER: NonNullable<SessionState["character"]> = characterInfo({
  expressions: [
    { name: "default", label: "通常" },
    { name: "thinking", label: "作業中" },
    { name: "proud", label: "どや顔" },
  ],
  // **ラスタにしてある**（`<Portrait>` は SVG のときだけ中身を `fetch` しに行くので、この
  // テストの関心ではない非同期がまぎれる）。SVG の読み込みは
  // `test/browser/components/domain/portrait.test.tsx` が見る。
  ...shownPortraits({
    default: "/character/default.png?v=fictional@1",
    thinking: "/character/thinking.png?v=fictional@1",
    proud: "/character/proud.png?v=fictional@1",
  }),
  outfitAccents: shownOutfitAccents({ default: "#b8c7ff", heavy: "#ffb3a7" }),
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

// `<CharacterEdit>` は立ち絵に `<Portrait>`（`useQuery`）を使うので `QueryClientProvider` が要る
// （このフィクスチャの立ち絵はラスタなので実際には fetch しないが、hook 自体は呼ばれる）。
function renderCharacterEdit(
  character: SessionState["character"],
  dispatch: CommandSpy = () => {},
  characterPacks: readonly CharacterPackEntry[] = [],
): void {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, character, characterPacks }, dispatch)
  const queryClient = new QueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <SessionStoreContext.Provider value={store}>
        <CharacterEdit />
      </SessionStoreContext.Provider>
    </QueryClientProvider>,
  )
}

// 差し色の送信は200ms（`ACCENT_DEBOUNCE_MS`）まとめるので、それより長く実時間で待つ。
function waitForDebounce(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 250))
}

/** 表情を消す前の確かめ（`portrait-clear-confirm.tsx`）。開いていなければ `null`。 */
function clearConfirmDialog(): Element | null {
  return document.querySelector(".character-clear-confirm")
}

/** キャラクターを消す前の確かめ（`character-delete-confirm.tsx`）。開いていなければ `null`。 */
function deleteConfirmDialog(): Element | null {
  return document.querySelector(".character-delete-dialog")
}

/** 名前とプロフィールを変えるダイアログ（`character-profile-edit-dialog.tsx`）。開いていなければ
 * `null`。作るダイアログと同じ `.character-create-dialog` を流用しているので `aria-label` で見分ける。 */
function profileEditDialog(): Element | null {
  return document.querySelector('dialog[aria-label="名前とプロフィールを変える"]')
}

describe("CharacterEdit", () => {
  it("8つの表情ぶんの立ち絵の口と、4つの衣装ぶんの差し色を出す", () => {
    renderCharacterEdit(FIXTURE_CHARACTER)

    // ラベルはキャラクター定義の言葉。定義に無い表情（flustered / serious / curious / sad /
    // excited）は表情名がそのまま出る。立ち絵がある表情は「差し替える」、無い表情は「選ぶ」
    // （見える字は短く、どの表情かは読み上げに残す）。
    expect(screen.getByLabelText("通常を差し替える")).toBeDefined()
    expect(screen.getByLabelText("作業中を差し替える")).toBeDefined()
    expect(screen.getByLabelText("どや顔を差し替える")).toBeDefined()
    expect(screen.getByLabelText("flusteredを選ぶ")).toBeDefined()
    expect(screen.getByLabelText("seriousを選ぶ")).toBeDefined()
    expect(screen.getByLabelText("curiousを選ぶ")).toBeDefined()
    expect(screen.getByLabelText("sadを選ぶ")).toBeDefined()
    expect(screen.getByLabelText("excitedを選ぶ")).toBeDefined()
    expect(screen.getByLabelText("既定")).toBeDefined()
    expect(screen.getByLabelText("軽装（haiku）")).toBeDefined()
    expect(screen.getByLabelText("通常装備（sonnet）")).toBeDefined()
    expect(screen.getByLabelText("戦闘配置（opus）")).toBeDefined()
  })

  // **必須の1つ（default）は消せない**（`docs/requirements.md` 4.4）。画面にも口を出さない。
  it("default には消す口を出さない（立ち絵があっても）", () => {
    renderCharacterEdit(FIXTURE_CHARACTER)

    expect(screen.queryByRole("button", { name: "通常を消す" })).toBeNull()
    expect(screen.getByRole("button", { name: "どや顔を消す" })).toBeDefined()
  })

  // **必須から外れたので、thinking は立ち絵があれば消せる**（`src/shared/expression.ts`）。
  it("thinking は立ち絵があれば消す口を出す", () => {
    renderCharacterEdit(FIXTURE_CHARACTER)

    expect(screen.getByRole("button", { name: "作業中を消す" })).toBeDefined()
  })

  // **立ち絵が無い表情は、その表情の名前を書いた点線の空欄**（docs/screen-design.md 13.6）。
  it("立ち絵が無い表情は名前つきの空欄で出し、消す口は出さない", () => {
    renderCharacterEdit(FIXTURE_CHARACTER)

    expect(screen.queryByRole("button", { name: "flusteredを消す" })).toBeNull()
    // 空欄の枠そのものが選ぶ口で、どの表情かは枠の字に出る。
    const pick = screen.getByLabelText("flusteredを選ぶ")
    expect(pick.closest("label")?.textContent).toContain("flustered")
    // 立ち絵がある3つ以外の残り全部（EXPRESSIONS が伸びてもここは自動で追随する）。
    const blanks = [...document.querySelectorAll(".character-card-blank")]
    expect(blanks).toHaveLength(EXPRESSIONS.length - EXPRESSIONS_WITH_PORTRAIT.length)
    expect(blanks.map((blank) => blank.getAttribute("data-expression"))).toEqual(
      EXPRESSIONS.filter(
        (expression) => !(EXPRESSIONS_WITH_PORTRAIT as readonly string[]).includes(expression),
      ),
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

  // 乗せたときだけ出る口は、キーボードからも届く（消さずに透明にしてあり、Tab で入れる）。
  it("差し替える・消すの口は、フォーカスできる要素としてカードの中にある", () => {
    renderCharacterEdit(FIXTURE_CHARACTER)

    const card = screen.getByLabelText("どや顔を差し替える").closest("figure")
    const clear = screen.getByRole("button", { name: "どや顔を消す" })
    expect(card?.contains(clear)).toBe(true)
    clear.focus()
    expect(document.activeElement).toBe(clear)
  })

  it("カードに画像を落とすと、その表情の set-portrait を dispatch する", async () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))
    const blank = screen.getByLabelText("sadを選ぶ").closest("label")
    if (blank === null) {
      throw new Error("空欄のカードが無い")
    }

    fireEvent.drop(blank, {
      dataTransfer: { files: [new File(["png"], "dropped.png", { type: "image/png" })] },
    })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(calls).toEqual([
      {
        type: "set-portrait",
        pack: "fictional",
        expression: "sad",
        image: `data:image/png;base64,${Buffer.from("png").toString("base64")}`,
      },
    ])
  })

  // 消す前の確かめ（docs/screen-design.md 13.6「表情を消す前の確かめ」）。
  it("消す口を押しただけでは送らず、確かめの吹き出しを開く", () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))

    fireEvent.click(screen.getByRole("button", { name: "どや顔を消す" }))

    expect(calls).toEqual([])
    expect(clearConfirmDialog()?.hasAttribute("open")).toBe(true)
    expect(screen.getByText("「どや顔」を消しますか？")).toBeDefined()
    // 本文の「代わりに出る表情」の名前もパックのラベル（`resolveExpressionLabel`。原則4）。
    expect(screen.getByText("この表情を使う場面では「通常」が出ます。")).toBeDefined()
  })

  it("確かめの「消す」を押すと clear-portrait を1回だけ dispatch し、吹き出しを閉じる", () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))

    fireEvent.click(screen.getByRole("button", { name: "どや顔を消す" }))
    fireEvent.click(screen.getByRole("button", { name: "消す" }))

    expect(calls).toEqual([{ type: "clear-portrait", pack: "fictional", expression: "proud" }])
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

  // Esc は `<dialog>` を閉じて `close` イベントを出す（ブラウザの既定の振る舞い。
  // `task-board/task-run.test.tsx` と同じ起こし方）。
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

  // 外側のクリックは `<dialog>` 自身への click として届く（`<Dialog>` の backdrop クリックの
  // 読み替え）。
  it("外側のクリックで閉じ、何も送らない", () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))

    fireEvent.click(screen.getByRole("button", { name: "どや顔を消す" }))
    const dialog = clearConfirmDialog()
    if (dialog === null) {
      throw new Error("確かめが開いていない")
    }
    fireEvent.click(dialog)

    expect(calls).toEqual([])
    expect(clearConfirmDialog()).toBeNull()
  })

  it("立ち絵を選ぶと data URL を載せた set-portrait を dispatch し、入力欄を空に戻す", async () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))
    const input = screen.getByLabelText("どや顔を差し替える") as HTMLInputElement

    fireEvent.change(input, {
      target: { files: [new File(["<svg/>"], "picked.svg", { type: "image/svg+xml" })] },
    })
    // FileReader は非同期なので、dispatch まで1拍待つ。
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(calls).toEqual([
      {
        type: "set-portrait",
        pack: "fictional",
        expression: "proud",
        image: `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`,
      },
    ])
    // 同じファイルをもう一度選べるように戻している。
    expect(input.value).toBe("")
  })

  // 送信は200msまとめる（`src/browser/lib/debounce.ts`）ので、待ってから確かめる。
  it("差し色を変えると、少し待ってから set-outfit-accent を dispatch する", async () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))

    fireEvent.change(screen.getByLabelText("戦闘配置（opus）"), { target: { value: "#123456" } })
    expect(calls).toEqual([])
    await waitForDebounce()

    expect(calls).toEqual([
      { type: "set-outfit-accent", pack: "fictional", outfit: "heavy", color: "#123456" },
    ])
  })

  // 画面を開いただけでは何も送らない（`docs/coding-standards.md`「useEffect は4類型だけ」の
  // タイマーは効かせるが、起こすのは onChange だけ）。
  it("開いただけでは何も送らない", async () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))

    await waitForDebounce()

    expect(calls).toEqual([])
  })

  // ドラッグ中に何度も変わっても、離れてからの1回にまとまる。
  it("連続して差し色を変えても、送信は最後の値の1回にまとまる", async () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))
    const input = screen.getByLabelText("戦闘配置（opus）")

    fireEvent.change(input, { target: { value: "#111111" } })
    fireEvent.change(input, { target: { value: "#222222" } })
    fireEvent.change(input, { target: { value: "#333333" } })
    await waitForDebounce()

    expect(calls).toEqual([
      { type: "set-outfit-accent", pack: "fictional", outfit: "heavy", color: "#333333" },
    ])
  })

  // 引きずったまま画面を閉じても、まだ送っていない最後の値を落とさない
  // （`src/browser/lib/debounce.ts` のアンマウント時のフラッシュ）。
  it("送信前に画面を閉じても、待っていた最後の値をそのまま送る", () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))

    fireEvent.change(screen.getByLabelText("戦闘配置（opus）"), { target: { value: "#123456" } })
    expect(calls).toEqual([])
    cleanup()

    expect(calls).toEqual([
      { type: "set-outfit-accent", pack: "fictional", outfit: "heavy", color: "#123456" },
    ])
  })

  it("画面の差し色（仕事 / 雑談）の口を出す", () => {
    renderCharacterEdit({ ...FIXTURE_CHARACTER, accent: "#f2b0a0", chatAccent: "#f2984a" })

    expect((screen.getByLabelText("仕事") as HTMLInputElement).value).toBe("#f2b0a0")
    expect((screen.getByLabelText("雑談") as HTMLInputElement).value).toBe("#f2984a")
    expect(screen.getByRole("button", { name: "雑談も仕事と同じにする" })).toBeDefined()
    expect(screen.queryByText("雑談も仕事と同じ")).toBeNull()
    // 色だけにせず、今の値を16進の字でも添える。
    expect(screen.getByText("#f2984a")).toBeDefined()
  })

  it("chatAccent が無いパックでは、雑談の見本に仕事の差し色と「雑談も仕事と同じ」の字を出し、戻す口は出さない", () => {
    renderCharacterEdit({ ...FIXTURE_CHARACTER, accent: "#f2b0a0", chatAccent: undefined })

    expect((screen.getByLabelText("雑談") as HTMLInputElement).value).toBe("#f2b0a0")
    expect(screen.queryByRole("button", { name: "雑談も仕事と同じにする" })).toBeNull()
    // 色見本が仕事と同じ色なのを、色だけでなく字でも伝える（13.1 原則1）。
    expect(screen.getByText("雑談も仕事と同じ")).toBeDefined()
  })

  it("仕事の差し色を変えると、少し待ってから set-accent（target: work）を dispatch する", async () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))

    fireEvent.change(screen.getByLabelText("仕事"), { target: { value: "#123456" } })
    expect(calls).toEqual([])
    await waitForDebounce()

    expect(calls).toEqual([
      { type: "set-accent", pack: "fictional", target: "work", color: "#123456" },
    ])
  })

  it("「雑談も仕事と同じにする」を押すと clear-chat-accent を dispatch する", () => {
    const calls: unknown[] = []
    renderCharacterEdit({ ...FIXTURE_CHARACTER, chatAccent: "#f2984a" }, (command) =>
      calls.push(command),
    )

    fireEvent.click(screen.getByRole("button", { name: "雑談も仕事と同じにする" }))

    expect(calls).toEqual([{ type: "clear-chat-accent", pack: "fictional" }])
  })

  it("画面から変えられないパックでは、画面の差し色と戻す口も操作できない", () => {
    renderCharacterEdit({ ...FIXTURE_CHARACTER, chatAccent: "#f2984a", editable: false })

    expect((screen.getByLabelText("仕事") as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText("雑談") as HTMLInputElement).disabled).toBe(true)
    const resetButton = screen.getByRole("button", { name: "雑談も仕事と同じにする" })
    // **押せないは `aria-disabled` の1通り**（`Button`。`docs/design.md` 2章）。本物の `disabled`
    // にはしないので、フォーカスは残る（`button.test.tsx` と同じ確かめ方）。
    expect(resetButton.getAttribute("aria-disabled")).toBe("true")
    expect(resetButton.hasAttribute("disabled")).toBe(false)
    resetButton.focus()
    expect(document.activeElement).toBe(resetButton)
  })

  it("押せないあいだは「雑談も仕事と同じにする」を押しても clear-chat-accent を送らない", () => {
    const calls: unknown[] = []
    renderCharacterEdit(
      { ...FIXTURE_CHARACTER, chatAccent: "#f2984a", editable: false },
      (command) => calls.push(command),
    )

    fireEvent.click(screen.getByRole("button", { name: "雑談も仕事と同じにする" }))

    expect(calls).toEqual([])
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

    expect((screen.getByLabelText("通常を差し替える") as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText("既定") as HTMLInputElement).disabled).toBe(true)
    expect(document.querySelector(".character-screen-note")?.textContent).toContain(
      "characters/local",
    )
  })

  // 背景（`docs/screen-design.md` 13.8）。**口は「差し替える」と「消す」の2つだけ**で、覆いの濃さの
  // つまみは出さない。
  it("背景が無いパックでは、点線の枠と「背景なし」を出し、消す口は出さない", () => {
    renderCharacterEdit(FIXTURE_CHARACTER)

    expect(document.querySelectorAll(".character-background-blank")).toHaveLength(1)
    expect(screen.getByText("背景なし")).toBeDefined()
    expect(screen.getByLabelText("背景を差し替える")).toBeDefined()
    expect(screen.queryByRole("button", { name: "背景を消す" })).toBeNull()
  })

  it("背景があるパックでは、いまの背景を小さく出して消す口も出す", () => {
    renderCharacterEdit({
      ...FIXTURE_CHARACTER,
      background: { image: "/character/background.png?v=fictional@1", veil: 0.75 },
    })

    expect((screen.getByAltText("いまの背景") as HTMLImageElement).getAttribute("src")).toBe(
      "/character/background.png?v=fictional@1",
    )
    expect(screen.getByRole("button", { name: "背景を消す" })).toBeDefined()
  })

  it("背景を消す口を押すと clear-background を dispatch する", () => {
    const calls: unknown[] = []
    renderCharacterEdit(
      {
        ...FIXTURE_CHARACTER,
        background: { image: "/character/background.png?v=fictional@1", veil: 0.75 },
      },
      (command) => calls.push(command),
    )

    fireEvent.click(screen.getByRole("button", { name: "背景を消す" }))

    expect(calls).toEqual([{ type: "clear-background", pack: "fictional" }])
  })

  it("背景を選ぶと data URL を載せた set-background を dispatch し、入力欄を空に戻す", async () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))
    const input = screen.getByLabelText("背景を差し替える") as HTMLInputElement

    fireEvent.change(input, {
      target: { files: [new File(["png"], "forest.png", { type: "image/png" })] },
    })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(calls).toEqual([
      {
        type: "set-background",
        pack: "fictional",
        image: `data:image/png;base64,${Buffer.from("png").toString("base64")}`,
      },
    ])
    expect(input.value).toBe("")
  })

  // 顔（`docs/screen-design.md` 13.9「顔」）。**口は「差し替える」と「消す」の2つだけ**で、背景と
  // 同じ形。
  it("顔が無いパックでは、点線の丸と「顔なし」を出し、消す口は出さない", () => {
    renderCharacterEdit(FIXTURE_CHARACTER)

    expect(document.querySelectorAll(".character-face-field-blank")).toHaveLength(1)
    expect(screen.getByText("顔なし")).toBeDefined()
    expect(screen.getByLabelText("顔を差し替える")).toBeDefined()
    expect(screen.queryByRole("button", { name: "顔を消す" })).toBeNull()
  })

  it("顔があるパックでは、いまの顔を小さく出して消す口も出す", () => {
    renderCharacterEdit({
      ...FIXTURE_CHARACTER,
      face: "/character/face.png?v=fictional@1",
    })

    expect((screen.getByAltText("いまの顔") as HTMLImageElement).getAttribute("src")).toBe(
      "/character/face.png?v=fictional@1",
    )
    expect(screen.getByRole("button", { name: "顔を消す" })).toBeDefined()
  })

  it("顔を消す口を押すと clear-face を dispatch する", () => {
    const calls: unknown[] = []
    renderCharacterEdit(
      { ...FIXTURE_CHARACTER, face: "/character/face.png?v=fictional@1" },
      (command) => calls.push(command),
    )

    fireEvent.click(screen.getByRole("button", { name: "顔を消す" }))

    expect(calls).toEqual([{ type: "clear-face", pack: "fictional" }])
  })

  it("顔を選ぶと data URL を載せた set-face を dispatch し、入力欄を空に戻す", async () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))
    const input = screen.getByLabelText("顔を差し替える") as HTMLInputElement

    fireEvent.change(input, {
      target: { files: [new File(["png"], "face.png", { type: "image/png" })] },
    })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(calls).toEqual([
      {
        type: "set-face",
        pack: "fictional",
        image: `data:image/png;base64,${Buffer.from("png").toString("base64")}`,
      },
    ])
    expect(input.value).toBe("")
  })

  it("キャラクターが届く前は何も出さない", () => {
    renderCharacterEdit(undefined)

    expect(document.querySelectorAll("section")).toHaveLength(0)
    expect(document.querySelectorAll(".character-gallery")).toHaveLength(0)
  })

  // 名前とプロフィールを変えるダイアログ（docs/screen-design.md 13.6「名乗り」）。
  describe("名前とプロフィールを変える", () => {
    it("押すと、いまの名前とひとことを入れたダイアログを開く", () => {
      renderCharacterEdit({ ...FIXTURE_CHARACTER, name: "架空の精霊", tagline: "気ままな相棒" })

      fireEvent.click(screen.getByRole("button", { name: "名前とプロフィールを変える" }))

      expect(profileEditDialog()?.hasAttribute("open")).toBe(true)
      expect((screen.getByLabelText("名前") as HTMLInputElement).value).toBe("架空の精霊")
      expect((screen.getByLabelText("ひとことプロフィール") as HTMLInputElement).value).toBe(
        "気ままな相棒",
      )
    })

    it("名前とひとことを書き換えて保存すると、set-profile を1回送って閉じる", () => {
      const calls: unknown[] = []
      renderCharacterEdit(
        { ...FIXTURE_CHARACTER, name: "架空の精霊", tagline: "気ままな相棒" },
        (command) => calls.push(command),
      )

      fireEvent.click(screen.getByRole("button", { name: "名前とプロフィールを変える" }))
      fireEvent.change(screen.getByLabelText("名前"), { target: { value: "新しい名前" } })
      fireEvent.change(screen.getByLabelText("ひとことプロフィール"), {
        target: { value: "新しいひとこと" },
      })
      fireEvent.click(screen.getByRole("button", { name: "保存する" }))

      expect(calls).toEqual([
        { type: "set-profile", pack: "fictional", name: "新しい名前", tagline: "新しいひとこと" },
      ])
      expect(profileEditDialog()).toBeNull()
    })

    it("「やめる」で閉じ、何も送らない", () => {
      const calls: unknown[] = []
      renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))

      fireEvent.click(screen.getByRole("button", { name: "名前とプロフィールを変える" }))
      fireEvent.change(screen.getByLabelText("名前"), { target: { value: "触らない名前" } })
      fireEvent.click(screen.getByRole("button", { name: "やめる" }))

      expect(calls).toEqual([])
      expect(profileEditDialog()).toBeNull()
    })

    it("画面から変えられないパックでは口を出さない", () => {
      renderCharacterEdit({ ...FIXTURE_CHARACTER, editable: false })

      expect(screen.queryByRole("button", { name: "名前とプロフィールを変える" })).toBeNull()
    })
  })

  // このキャラクターを消す帯とその確かめ（docs/screen-design.md 13.6「このキャラクターを消す」）。
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

      expect(screen.getByRole("button", { name: /架空の精霊 を消す/ })).toHaveProperty(
        "disabled",
        true,
      )
    })

    // 使用中以外のパックを詳しい設定に出すには、一覧にもう1件（`other`）を足し、hash でそれを
    // 選ぶ（`character-screen.test.tsx` と同じ形。`docs/screen-design.md` 13.6
    // 「選んでいるパックは hash に持つ」）。
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
      // **押せないは `aria-disabled` の1通り**（`Button`）。本物の `disabled` にはしないので、
      // フォーカスは残る（`button.test.tsx` と同じ確かめ方）。
      expect(okButton.getAttribute("aria-disabled")).toBe("true")
      expect(okButton.hasAttribute("disabled")).toBe(false)
      okButton.focus()
      expect(document.activeElement).toBe(okButton)

      fireEvent.change(screen.getByLabelText("確かめのため、id を入力してください"), {
        target: { value: "othe" },
      })
      expect(okButton.getAttribute("aria-disabled")).toBe("true")
    })

    it("押せないあいだ「消す」を押しても delete-character を送らない", () => {
      selectOther()
      const calls: unknown[] = []
      renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command), OTHER_PACKS)

      fireEvent.click(screen.getByRole("button", { name: /別の精霊 を消す/ }))
      fireEvent.click(screen.getByRole("button", { name: "消す" }))

      expect(calls).toEqual([])
    })

    it("id が完全に一致すると「消す」が押せ、delete-character を1回だけ送って閉じる", () => {
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

      expect(calls).toEqual([{ type: "delete-character", pack: "other" }])
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
