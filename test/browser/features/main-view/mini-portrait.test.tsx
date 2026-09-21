import { afterEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, render } from "@testing-library/react"

import { MiniPortrait } from "../../../../src/browser/features/main-view/mini-portrait.tsx"
import { publishBrushTip, type BrushTip } from "../../../../src/browser/stores/brush-tip.ts"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/shared/session-state.ts"
import { sessionStoreWith } from "../../session-store.ts"

// **どこに見えているか（重なり・大きさ）は目視で確かめる**（`docs/architecture.md`
// 「手で確かめること」）。ここで守るのは、筆先に連れて出入りすることと、置く座標を筆先から
// 取っていることだけ。フィクスチャは手で書いた架空のキャラクター定義。

const FIXTURE_CHARACTER: NonNullable<SessionState["character"]> = {
  pack: "fictional",
  name: "架空の精霊",
  accent: undefined,
  speechMarker: undefined,
  expressions: [{ name: "default", label: "通常" }],
  portraits: {
    default: "/character/default.png",
    thinking: undefined,
    proud: undefined,
    flustered: undefined,
    serious: undefined,
    curious: undefined,
    sad: undefined,
    excited: undefined,
  },
  mini: "/character/mini.png",
  outfitAccents: {
    default: undefined,
    light: undefined,
    normal: undefined,
    heavy: undefined,
  },
  background: undefined,
  editable: true,
}

const TIP: BrushTip = { x: 320, top: 180, bottom: 206, stroke: "sweep" }

afterEach(() => {
  cleanup()
  act(() => {
    publishBrushTip(undefined)
  })
})

function renderMiniPortrait(character: SessionState["character"]): void {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, character })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionStoreContext.Provider value={store}>
        <MiniPortrait />
      </SessionStoreContext.Provider>
    </QueryClientProvider>,
  )
}

function miniImage(): HTMLElement | null {
  const node = document.querySelector("img")
  return node instanceof HTMLElement ? node : null
}

/** 置き方を持つ入れ物（`position: fixed` の `transform` に筆先の座標が入る）。 */
function placement(): HTMLElement {
  const image = miniImage()
  const node = image?.parentElement?.parentElement
  if (!(node instanceof HTMLElement)) {
    throw new Error("ミニ立ち絵の入れ物が見つからない")
  }
  return node
}

describe("<MiniPortrait>（筆先に添うミニ立ち絵）", () => {
  it("筆先が無いあいだは出ない", () => {
    renderMiniPortrait(FIXTURE_CHARACTER)

    expect(miniImage()).toBeNull()
  })

  it("筆先が配られると出て、筆先の右・行の下端に置かれる", () => {
    renderMiniPortrait(FIXTURE_CHARACTER)
    act(() => {
      publishBrushTip(TIP)
    })

    expect(miniImage()?.getAttribute("src")).toBe("/character/mini.png")
    expect(placement().style.transform).toBe("translate3d(320px, 206px, 0) translateY(-100%)")
  })

  it("筆先が動けば付いていく", () => {
    renderMiniPortrait(FIXTURE_CHARACTER)
    act(() => {
      publishBrushTip(TIP)
    })
    act(() => {
      publishBrushTip({ x: 96, top: 206, bottom: 232, stroke: "sweep" })
    })

    expect(placement().style.transform).toBe("translate3d(96px, 232px, 0) translateY(-100%)")
  })

  it("斜めの戻りをなぞっているあいだは、追従の間合いを差し替える印が付く", () => {
    renderMiniPortrait(FIXTURE_CHARACTER)
    act(() => {
      publishBrushTip(TIP)
    })

    expect(placement().className).not.toContain("mini-portrait-returning")

    act(() => {
      publishBrushTip({ ...TIP, stroke: "return" })
    })

    expect(placement().className).toContain("mini-portrait-returning")
  })

  it("出し切って筆先が消えたら、ミニ立ち絵も消える", () => {
    renderMiniPortrait(FIXTURE_CHARACTER)
    act(() => {
      publishBrushTip(TIP)
    })
    act(() => {
      publishBrushTip(undefined)
    })

    expect(miniImage()).toBeNull()
  })

  it("縮小する素材が無いパック（mini も portraits.default も無い）では出ない", () => {
    renderMiniPortrait({ ...FIXTURE_CHARACTER, mini: undefined })
    act(() => {
      publishBrushTip(TIP)
    })

    expect(miniImage()).toBeNull()
  })

  it("キャラクターがまだ届いていないときも出ない", () => {
    renderMiniPortrait(undefined)
    act(() => {
      publishBrushTip(TIP)
    })

    expect(miniImage()).toBeNull()
  })
})
