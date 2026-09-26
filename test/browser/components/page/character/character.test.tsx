import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { Character } from "../../../../../src/browser/components/page/character/character.tsx"
import { SessionStoreContext } from "../../../../../src/browser/stores/session.tsx"
import { type PendingAsk } from "../../../../../src/shared/pending-ask.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session-state.ts"
import { characterInfo, characterPackEntry, shownPortraits } from "../../../../fixture/character.ts"
import { typedElement } from "../../../../typed-element.ts"
import { type CommandSpy, putState, sessionStoreWith } from "../../../session-store.ts"

// 手で書いた架空のキャラクターパック2つ（docs/coding-standards.md「会話内容の扱い」）。
// 使用中の `fictional` と、使用中ではない `other`。立ち絵はラスタにしてある（`<Portrait>` は
// SVG のときだけ中身を `fetch` しに行くので、このテストの関心ではない非同期がまぎれる）。
const FIXTURE_CHARACTER: NonNullable<SessionState["character"]> = characterInfo({
  tagline: "架空のひとこと",
  ...shownPortraits({ default: "/character/fictional/default.png?v=1" }),
})

const OTHER_CHARACTER: NonNullable<SessionState["character"]> = characterInfo({
  pack: "other",
  name: "別の精霊",
  expressions: [
    { name: "default", label: "ふつう" },
    { name: "proud", label: "得意" },
  ],
  ...shownPortraits({
    default: "/character/other/default.png?v=1",
    proud: "/character/other/proud.png?v=1",
  }),
})

const FIXTURE_PACKS = [
  characterPackEntry("fictional", "架空の精霊", { character: FIXTURE_CHARACTER, inUse: true }),
  characterPackEntry("other", "別の精霊", { character: OTHER_CHARACTER }),
]

// 手で書いた架空の答え待ち（許可の問い合わせ1件）。
const FIXTURE_PENDING: PendingAsk = {
  kind: "permission",
  id: "ask-1",
  toolName: "Read",
  input: {},
}

let themeStyleElement: HTMLStyleElement | undefined

// 差し色の `<input type="color">` は定義に無い衣装の初期値を `--accent` から読む
// （`browser/domain/appearance-color.ts` の `readAccentColor`）ので、`:root` を疑似的に用意する。
beforeEach(() => {
  themeStyleElement = document.createElement("style")
  themeStyleElement.textContent =
    ":root { --ground: #191720; --surface: #221f2b; --ink: #e8e3ea; --accent: #f2b0a0; }"
  document.head.appendChild(themeStyleElement)
  window.location.hash = "#character"
})

afterEach(() => {
  cleanup()
  themeStyleElement?.remove()
  themeStyleElement = undefined
  window.location.hash = ""
})

function renderCharacter(state: Partial<SessionState> = {}, spy: CommandSpy = () => {}): void {
  const store = sessionStoreWith(
    {
      ...INITIAL_SESSION_STATE,
      character: FIXTURE_CHARACTER,
      characterPacks: FIXTURE_PACKS,
      ...state,
    },
    spy,
  )
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionStoreContext.Provider value={store}>
        <Character />
      </SessionStoreContext.Provider>
    </QueryClientProvider>,
  )
}

/**
 * 一覧の行を押す。行は `<a href>` で、happy-dom が押したリンクの hash を書くか・`hashchange` を
 * 出すかは実装依存なので、href の hash をこのテストが書いて流す（本物のブラウザは必ず出す）。
 */
function clickListRow(name: string): void {
  const row = screen.getByRole("link", { name: new RegExp(name) })
  act(() => {
    window.location.hash = row.getAttribute("href") ?? ""
    window.dispatchEvent(new Event("hashchange"))
  })
}

function profileName(): string | null | undefined {
  return document.querySelector(".character-profile-name")?.textContent
}

describe("Character", () => {
  it("左に一覧（件数・行・新しく作る）、右に使用中のパックの詳しい設定を出す", () => {
    renderCharacter()

    const list = screen.getByRole("navigation", { name: "キャラクター一覧" })
    expect(list.querySelector(".character-list-heading")?.textContent).toBe("キャラクター2")
    expect(screen.getByRole("button", { name: "新しく作る" })).toBeDefined()
    // 使用中の行は表情の枚数と「使用中」を添え、選ばれている（aria-current）。
    const inUseRow = screen.getByRole("link", { name: /架空の精霊/ })
    expect(inUseRow.textContent).toContain("使用中")
    expect(inUseRow.getAttribute("aria-current")).toBe("page")
    expect(inUseRow.getAttribute("href")).toBe("#character?pack=fictional")

    expect(profileName()).toBe("架空の精霊")
    expect(document.querySelector(".character-profile-id")?.textContent).toBe("id: fictional")
    expect(document.querySelector(".character-in-use")?.textContent).toBe("使用中")
    expect(screen.getByText("架空のひとこと")).toBeDefined()
    // 使用中のパックには切り替える口を出さない。
    expect(screen.queryByRole("button", { name: /このキャラクターに切り替える/ })).toBeNull()
  })

  // 完了条件: 「新しく作る」がダイアログを開き、作れたら閉じて一覧で新しいパックが選ばれる。
  // id・名前・立ち絵・差し色を持つ characterPack.create の組み立てそのものは
  // `character-create.test.tsx` / `use-character-create.test.tsx` が持つので、ここでは
  // 送られた id（次の選択に効く）だけを見る。
  it("新しく作るはダイアログを開き、作れたら閉じて一覧でそのパックを選ぶ", async () => {
    const calls: unknown[] = []
    const store = sessionStoreWith(
      { ...INITIAL_SESSION_STATE, character: FIXTURE_CHARACTER, characterPacks: FIXTURE_PACKS },
      (command) => calls.push(command),
    )
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SessionStoreContext.Provider value={store}>
          <Character />
        </SessionStoreContext.Provider>
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole("button", { name: "新しく作る" }))
    expect(screen.getByRole("heading", { name: "新しいキャラクター" })).toBeDefined()

    fireEvent.change(screen.getByLabelText("id"), { target: { value: "fictional-3" } })
    await act(async () => {
      fireEvent.change(screen.getByLabelText("いつもの顔の立ち絵を選ぶ"), {
        target: { files: [new File(["<svg/>"], "picked.svg", { type: "image/svg+xml" })] },
      })
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    fireEvent.click(screen.getByRole("button", { name: "作る" }))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ procedure: "characterPack.create", id: "fictional-3" })
    // まだ一覧に出ていないので、ダイアログは開いたまま。
    expect(screen.getByRole("heading", { name: "新しいキャラクター" })).toBeDefined()

    // 選択肢の増えた character-changed（`hello` で丸ごと入れ替え）が届いたあと。
    act(() => {
      putState(store, {
        ...INITIAL_SESSION_STATE,
        character: FIXTURE_CHARACTER,
        characterPacks: [...FIXTURE_PACKS, characterPackEntry("fictional-3", "fictional-3")],
      })
    })

    expect(screen.queryByRole("heading", { name: "新しいキャラクター" })).toBeNull()
    expect(screen.getByRole("link", { name: /fictional-3/ }).getAttribute("aria-current")).toBe(
      "page",
    )
  })

  // 完了条件: 一覧で別のパックを選ぶと右側がそのパックの中身に替わり、そこで差し替えた立ち絵が
  // そのパックに書かれる。
  it("一覧で別のパックを選ぶと右側がそのパックに替わり、差し替えた立ち絵はそのパックへ書く", async () => {
    const calls: unknown[] = []
    renderCharacter({}, (command) => calls.push(command))

    clickListRow("別の精霊")

    expect(profileName()).toBe("別の精霊")
    expect(document.querySelector(".character-profile-id")?.textContent).toBe("id: other")
    expect(document.querySelector(".character-in-use")).toBeNull()
    expect(screen.getByRole("link", { name: /別の精霊/ }).getAttribute("aria-current")).toBe("page")
    // 表情のラベルも選んだパックの言葉になる。
    const input = typedElement(
      screen.getByLabelText("得意を差し替える"),
      HTMLInputElement,
      "得意を差し替えるの入力欄",
    )
    fireEvent.change(input, {
      target: { files: [new File(["png"], "picked.png", { type: "image/png" })] },
    })
    // FileReader は非同期なので、dispatch まで1拍待つ。
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(calls).toEqual([
      {
        procedure: "characterPack.setPortrait",
        pack: "other",
        expression: "proud",
        image: `data:image/png;base64,${Buffer.from("png").toString("base64")}`,
      },
    ])
  })

  it("選んでいるパックは hash に残るので、開き直しても同じパックが出る", () => {
    window.location.hash = "#character?pack=other"
    renderCharacter()

    expect(profileName()).toBe("別の精霊")
  })

  it("一覧に無い名前が hash に残っていたら、使用中のパックに落ちる", () => {
    window.location.hash = "#character?pack=gone"
    renderCharacter()

    expect(profileName()).toBe("架空の精霊")
  })

  it("使用中以外のパックでは「このキャラクターに切り替える」が session.switchCharacter を送る", () => {
    const calls: unknown[] = []
    window.location.hash = "#character?pack=other"
    renderCharacter({}, (command) => calls.push(command))

    fireEvent.click(screen.getByRole("button", { name: /このキャラクターに切り替える/ }))

    expect(calls).toEqual([{ procedure: "session.switchCharacter", name: "other" }])
  })

  // 切り替えは起こし直しなので、ターン進行中は押せない（サイドバーの `<select>` と同じ規則）。
  it("ターン進行中は「このキャラクターに切り替える」を押せない", () => {
    window.location.hash = "#character?pack=other"
    renderCharacter({ turn: { kind: "running", startedAt: 1 } })

    const button = screen.getByRole("button", { name: /このキャラクターに切り替える/ })
    // 押せないは `aria-disabled` の1通り（`Button`）。本物の `disabled` にはしないので、
    // フォーカスは残る（`button.test.tsx` と同じ確かめ方）。
    expect(button.getAttribute("aria-disabled")).toBe("true")
    expect(button.hasAttribute("disabled")).toBe(false)
    expect(button.getAttribute("title")).toContain("ターン進行中")
    button.focus()
    expect(document.activeElement).toBe(button)
  })

  it("ターン進行中は「このキャラクターに切り替える」を押しても session.switchCharacter を送らない", () => {
    const calls: unknown[] = []
    window.location.hash = "#character?pack=other"
    renderCharacter({ turn: { kind: "running", startedAt: 1 } }, (command) => calls.push(command))

    fireEvent.click(screen.getByRole("button", { name: /このキャラクターに切り替える/ }))

    expect(calls).toEqual([])
  })

  // 戻る口と答え待ちの印は帯（`components/domain/screen-nav/`）へ移った（docs/screen-design.md 13.9）。
  // 同じ口を2つ置かないので、この画面には残っていない。
  it("会話へ戻る口と答え待ちの印は持たない", () => {
    renderCharacter({ pending: [FIXTURE_PENDING] })

    expect(document.querySelector('a[href="#"]')).toBeNull()
    expect(document.querySelector(".character-screen-pending")).toBeNull()
  })

  // 地・領域・字の色は帯の歯車へ移り（13.6 の表）、パックの持ち物である差し色だけが残る。
  it("地・領域・字の色の操作子は持たず、差し色は残る", () => {
    renderCharacter()

    expect(screen.queryByLabelText("画面の地")).toBeNull()
    expect(screen.queryByLabelText("領域の地")).toBeNull()
    expect(screen.queryByLabelText("字の色")).toBeNull()

    const headings = [...document.querySelectorAll("h2")].map((node) => node.textContent)
    expect(headings).toContain("画面の差し色")
    expect(headings.some((text) => text?.startsWith("立ち絵の差し色"))).toBe(true)
    expect(headings).not.toContain("画面の色")
  })

  // キャラクターが届く前でも行き止まりにしない（作る口だけは出す。会話へ戻る口は帯にある）。
  it("キャラクターが届く前でも作る口を出す", () => {
    renderCharacter({ character: undefined, characterPacks: [] })

    expect(screen.getByRole("button", { name: "新しく作る" })).toBeDefined()
    expect(document.querySelector(".character-profile-name")).toBeNull()
  })
})
