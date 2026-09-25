import { afterEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, render } from "@testing-library/react"

import { MiniPortrait } from "../../../../../../../src/browser/components/page/conversation/components/main-view/mini-portrait.tsx"
import {
  publishBrushTip,
  restBrushTip,
  type BrushTip,
} from "../../../../../../../src/browser/domain/reveal/brush-tip.ts"
import { SessionStoreContext } from "../../../../../../../src/browser/stores/session.tsx"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../src/shared/session-state.ts"
import { characterInfo, shownPortraits } from "../../../../../../fixture/character.ts"
import { sessionStoreWith } from "../../../../../session-store.ts"

// **どこに見えているか（重なり・大きさ）は目視で確かめる**（`docs/architecture.md`
// 「手で確かめること」）。ここで守るのは、筆先に連れて出入りすることと、置く座標を筆先から
// 取っていることだけ。フィクスチャは手で書いた架空のキャラクター定義。

const FIXTURE_CHARACTER: NonNullable<SessionState["character"]> = characterInfo({
  ...shownPortraits({ default: "/character/default.png" }),
  mini: "/character/mini.png",
})

/** 出ているやり取り（`shownTurnId`）。筆先が別のやり取りのものなら立ち絵は出ない。 */
const SHOWN_TURN_ID = 7

const TIP: BrushTip = {
  turnId: SHOWN_TURN_ID,
  phase: "writing",
  x: 320,
  top: 180,
  bottom: 206,
  stroke: "sweep",
}

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
        <MiniPortrait shownTurnId={SHOWN_TURN_ID} />
      </SessionStoreContext.Provider>
    </QueryClientProvider>,
  )
}

function miniImage(): HTMLElement | null {
  const node = document.querySelector("img")
  return node instanceof HTMLElement ? node : null
}

/** 置き方を持つ入れ物（`position: absolute` の `transform` に筆先の座標が入る）。 */
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

  it("alt はパックのミニ立ち絵の呼び名を名前に添え、呼び名の無いパックでは「ミニ立ち絵」に落ちる", () => {
    renderMiniPortrait({ ...FIXTURE_CHARACTER, name: "架空の名前", miniCall: "架空の使い魔" })
    act(() => {
      publishBrushTip(TIP)
    })
    expect(miniImage()?.getAttribute("alt")).toBe("架空の名前の架空の使い魔")

    cleanup()
    renderMiniPortrait({ ...FIXTURE_CHARACTER, name: "架空の名前", miniCall: undefined })
    expect(miniImage()?.getAttribute("alt")).toBe("架空の名前のミニ立ち絵")
  })

  it("筆先が動けば付いていく", () => {
    renderMiniPortrait(FIXTURE_CHARACTER)
    act(() => {
      publishBrushTip(TIP)
    })
    act(() => {
      publishBrushTip({ ...TIP, x: 96, top: 206, bottom: 232 })
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

  it("書き終わっても消えず、本文の右下へ寄る（どの行の上にも居座らない）", () => {
    renderMiniPortrait(FIXTURE_CHARACTER)
    act(() => {
      publishBrushTip(TIP)
    })

    act(() => {
      restBrushTip()
    })

    expect(miniImage()).not.toBeNull()
    // 縦は `translateY(-100%)` が外れる＝上端が行の下端に来て、敷いた床の上に立つ。横は筆先の
    // 座標を渡さない（右端に付けるのは `.mini-portrait-resting` の `right`）。
    expect(placement().style.transform).toBe("translate3d(0, 206px, 0)")
    expect(placement().className).toContain("mini-portrait-resting")
  })

  it("残っているあいだは、降りる動きの間合いに差し替わる", () => {
    renderMiniPortrait(FIXTURE_CHARACTER)
    act(() => {
      publishBrushTip({ ...TIP, stroke: "return" })
    })

    act(() => {
      restBrushTip()
    })

    expect(placement().className).not.toContain("mini-portrait-returning")
    expect(placement().className).toContain("mini-portrait-resting")
  })

  it("別のやり取りが出ているあいだは、残った筆先に付いて出ない", () => {
    renderMiniPortrait(FIXTURE_CHARACTER)
    act(() => {
      publishBrushTip(TIP)
    })
    act(() => {
      restBrushTip()
    })

    act(() => {
      publishBrushTip({ ...TIP, phase: "resting", turnId: SHOWN_TURN_ID + 1 })
    })

    expect(miniImage()).toBeNull()
  })

  it("同じやり取りで次の本文を書き始めると、新しい筆先へ移る", () => {
    renderMiniPortrait(FIXTURE_CHARACTER)
    act(() => {
      publishBrushTip(TIP)
    })
    act(() => {
      restBrushTip()
    })

    act(() => {
      publishBrushTip({ ...TIP, x: 12, top: 40, bottom: 66 })
    })

    expect(placement().style.transform).toBe("translate3d(12px, 66px, 0) translateY(-100%)")
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
