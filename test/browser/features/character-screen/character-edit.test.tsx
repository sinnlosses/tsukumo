import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { CharacterEdit } from "../../../../src/browser/features/character-screen/character-edit.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { EXPRESSIONS } from "../../../../src/shared/expression.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/shared/session-state.ts"
import { characterInfo, shownOutfitAccents, shownPortraits } from "../../../fixture/character.ts"
import { type CommandSpy, sessionStoreWith } from "../../session-store.ts"

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
  // `test/browser/components/portrait.test.tsx` が見る。
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
})

// `<CharacterEdit>` は立ち絵に `<Portrait>`（`useQuery`）を使うので `QueryClientProvider` が要る
// （このフィクスチャの立ち絵はラスタなので実際には fetch しないが、hook 自体は呼ばれる）。
function renderCharacterEdit(
  character: SessionState["character"],
  dispatch: CommandSpy = () => {},
): void {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, character }, dispatch)
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

  // **立ち絵が無い表情は点線の枠の空きにラベルと「選ぶ」だけ**（docs/screen-design.md 13.6）。
  it("立ち絵が無い表情には消す口を出さず、「選ぶ」を出す", () => {
    renderCharacterEdit(FIXTURE_CHARACTER)

    expect(screen.queryByRole("button", { name: "flusteredを消す" })).toBeNull()
    const pick = screen.getByLabelText("flusteredを選ぶ")
    expect(pick.closest("label")?.textContent).toContain("選ぶ")
    // 立ち絵そのものは無いので、点線の枠の空きが代わりに出る
    // （立ち絵がある3つ以外の残り全部。EXPRESSIONS が伸びてもここは自動で追随する）。
    expect(document.querySelectorAll(".character-gallery-blank")).toHaveLength(
      EXPRESSIONS.length - EXPRESSIONS_WITH_PORTRAIT.length,
    )
  })

  it("消す口を押すと clear-portrait を dispatch する", () => {
    const calls: unknown[] = []
    renderCharacterEdit(FIXTURE_CHARACTER, (command) => calls.push(command))

    fireEvent.click(screen.getByRole("button", { name: "どや顔を消す" }))

    expect(calls).toEqual([{ type: "clear-portrait", pack: "fictional", expression: "proud" }])
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
    expect(screen.getByRole("button", { name: "仕事と同じにする" })).toBeDefined()
    expect(screen.queryByText("仕事と同じ")).toBeNull()
  })

  it("chatAccent が無いパックでは、雑談の見本に仕事の差し色と「仕事と同じ」の字を出し、戻す口は出さない", () => {
    renderCharacterEdit({ ...FIXTURE_CHARACTER, accent: "#f2b0a0", chatAccent: undefined })

    expect((screen.getByLabelText("雑談") as HTMLInputElement).value).toBe("#f2b0a0")
    expect(screen.queryByRole("button", { name: "仕事と同じにする" })).toBeNull()
    // 色見本が仕事と同じ色なのを、色だけでなく字でも伝える（13.1 原則1）。
    expect(screen.getByText("仕事と同じ")).toBeDefined()
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

  it("「仕事と同じにする」を押すと clear-chat-accent を dispatch する", () => {
    const calls: unknown[] = []
    renderCharacterEdit({ ...FIXTURE_CHARACTER, chatAccent: "#f2984a" }, (command) =>
      calls.push(command),
    )

    fireEvent.click(screen.getByRole("button", { name: "仕事と同じにする" }))

    expect(calls).toEqual([{ type: "clear-chat-accent", pack: "fictional" }])
  })

  it("画面から変えられないパックでは、画面の差し色と戻す口も操作できない", () => {
    renderCharacterEdit({ ...FIXTURE_CHARACTER, chatAccent: "#f2984a", editable: false })

    expect((screen.getByLabelText("仕事") as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText("雑談") as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByRole("button", { name: "仕事と同じにする" })).toHaveProperty(
      "disabled",
      true,
    )
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

  it("キャラクターが届く前は何も出さない", () => {
    renderCharacterEdit(undefined)

    expect(document.querySelectorAll("fieldset")).toHaveLength(0)
    expect(document.querySelectorAll(".character-gallery")).toHaveLength(0)
  })
})
