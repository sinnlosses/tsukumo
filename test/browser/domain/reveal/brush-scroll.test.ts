import { afterEach, describe, expect, it } from "vitest"

import {
  brushScroller,
  type BrushScroller,
} from "../../../../src/browser/domain/reveal/brush-scroll.ts"

/**
 * 転がる器のふり（happy-dom はレイアウトを持たないので、寸法を自分で名乗らせる）。
 * `overflow-y` と「中身がはみ出していること」の両方が揃ったものだけが器になる。
 */
function scrollerWith(bounds: { readonly top: number; readonly bottom: number }): HTMLElement {
  const scroller = document.createElement("div")
  scroller.style.overflowY = "auto"
  Object.defineProperty(scroller, "scrollHeight", { value: 4000, configurable: true })
  Object.defineProperty(scroller, "clientHeight", { value: 500, configurable: true })
  scroller.getBoundingClientRect = () => new DOMRect(0, bounds.top, 0, bounds.bottom - bounds.top)
  document.body.append(scroller)
  return scroller
}

/**
 * 器の中身の先頭に置いた根。筆先の座標の原点もこれにする。
 * 器を送るとビューポート上の位置がそのぶん上がるのも名乗らせるので、筆先の座標は器の中身の座標と同じになる。
 */
function rootIn(scroller: HTMLElement): HTMLElement {
  const root = document.createElement("div")
  root.getBoundingClientRect = () =>
    new DOMRect(0, scroller.getBoundingClientRect().top - scroller.scrollTop, 0, 0)
  scroller.append(root)
  return root
}

/** 根を原点にして器を決め、測っておく（演出が塊を書き始めるときと同じ）。 */
function measuredScroller(scroller: HTMLElement): BrushScroller {
  const root = rootIn(scroller)
  const brush = brushScroller(root, root)
  brush.remeasure()
  return brush
}

afterEach(() => {
  document.body.replaceChildren()
})

describe("brushScroller（ミニ立ち絵の立つ位置を画面の中に保つ）", () => {
  it("下端が下の縁に近づいたら、その差だけ器を送る", () => {
    const scroller = scrollerWith({ top: 0, bottom: 500 })
    scroller.scrollTop = 100

    // 見えている範囲は 100〜600。下の縁から 96px の内側は 504。550 はそれを 46px 超えている。
    measuredScroller(scroller).follow({ tipBottom: 550, tipHeight: 20 })

    expect(scroller.scrollTop).toBe(146)
  })

  it("上端が上の縁に近づいたら、逆へ送る", () => {
    const scroller = scrollerWith({ top: 0, bottom: 500 })
    scroller.scrollTop = 300

    // 上端は tipBottom(370) - tipHeight(20) = 350。見えている範囲は 300〜800 で、上の縁から 96px の内側は 396。
    // 350 はそれより 46px 上にある。
    measuredScroller(scroller).follow({ tipBottom: 370, tipHeight: 20 })

    expect(scroller.scrollTop).toBe(254)
  })

  it("縁から離れているあいだは動かさない", () => {
    const scroller = scrollerWith({ top: 0, bottom: 500 })
    scroller.scrollTop = 100

    measuredScroller(scroller).follow({ tipBottom: 320, tipHeight: 20 })

    expect(scroller.scrollTop).toBe(100)
  })

  it("筆先が無い（出し切った）ときは動かさない", () => {
    const scroller = scrollerWith({ top: 0, bottom: 500 })
    scroller.scrollTop = 100

    measuredScroller(scroller).follow(undefined)

    expect(scroller.scrollTop).toBe(100)
  })

  it("利用者が手で転がしたら、そのあとは送らない", () => {
    const scroller = scrollerWith({ top: 0, bottom: 500 })
    scroller.scrollTop = 100
    const brush = measuredScroller(scroller)

    window.dispatchEvent(new Event("wheel"))
    brush.follow({ tipBottom: 550, tipHeight: 20 })

    expect(scroller.scrollTop).toBe(100)
    brush.stop()
  })

  it("見張りを外したあとは、手で転がしても降りない（合図の口が残らない）", () => {
    const scroller = scrollerWith({ top: 0, bottom: 500 })
    scroller.scrollTop = 100
    const brush = measuredScroller(scroller)

    brush.stop()
    window.dispatchEvent(new Event("wheel"))
    brush.follow({ tipBottom: 550, tipHeight: 20 })

    expect(scroller.scrollTop).toBe(146)
  })

  it("帯が器より背が高いトピックでも、2回続けて follow しても scrollTop が往復しない", () => {
    const scroller = scrollerWith({ top: 0, bottom: 500 })
    const brush = measuredScroller(scroller)
    // tipHeight は `useReportReveal` が渡す見積もり（96px）。帯ぜんたい（行の多い
    // トピックでは器の高さに迫る）ではなくこの狭い範囲だけを追うので、往復しないはず。
    // 筆先の座標は器を送っても動かないので、2フレーム目も同じ値を渡す。
    brush.follow({ tipBottom: 450, tipHeight: 96 })
    const afterFirst = scroller.scrollTop

    brush.follow({ tipBottom: 450, tipHeight: 96 })

    expect(scroller.scrollTop).toBe(afterFirst)
  })

  it("余白も含めた範囲が器に収まらないほど狭いときは、下端を優先して往復しない", () => {
    // 器の高さ(200)が tipHeight(96) + 余白×2(192) = 288 より小さい、実運用ではまず
    // 起きない極端な狭さ。それでも下端（いま書いている足元）を優先し、上端の余白は諦める。
    const scroller = scrollerWith({ top: 0, bottom: 200 })
    const brush = measuredScroller(scroller)
    brush.follow({ tipBottom: 300, tipHeight: 96 })
    const afterFirst = scroller.scrollTop

    brush.follow({ tipBottom: 300, tipHeight: 96 })

    expect(scroller.scrollTop).toBe(afterFirst)
  })

  it("測る前は送らない", () => {
    const scroller = scrollerWith({ top: 0, bottom: 500 })
    scroller.scrollTop = 100
    const root = rootIn(scroller)

    brushScroller(root, root).follow({ tipBottom: 550, tipHeight: 20 })

    expect(scroller.scrollTop).toBe(100)
  })

  it("転がる祖先が無ければページ自身を送る", () => {
    const root = document.createElement("div")
    document.body.append(root)

    // 器を見つけられずに投げたり、根そのものを送ったりしない。
    expect(() => {
      const brush = brushScroller(root, root)
      brush.remeasure()
      brush.follow({ tipBottom: 20, tipHeight: 10 })
    }).not.toThrow()
    expect(root.scrollTop).toBe(0)
  })
})
