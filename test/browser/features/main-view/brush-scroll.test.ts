import { afterEach, describe, expect, it } from "bun:test"

import { brushScroller } from "../../../../src/browser/features/main-view/brush-scroll.ts"

/**
 * 転がる器のふり（happy-dom はレイアウトを持たないので、寸法を自分で名乗らせる）。
 * `overflow-y` と「中身がはみ出していること」の両方が揃ったものだけが器になる。
 */
function scrollerWith(bounds: { readonly top: number; readonly bottom: number }): HTMLElement {
  const scroller = document.createElement("div")
  scroller.style.overflowY = "auto"
  Object.defineProperty(scroller, "scrollHeight", { value: 4000, configurable: true })
  Object.defineProperty(scroller, "clientHeight", { value: 500, configurable: true })
  scroller.getBoundingClientRect = () =>
    ({ top: bounds.top, bottom: bounds.bottom }) as unknown as DOMRect
  document.body.append(scroller)
  return scroller
}

function rootIn(scroller: HTMLElement): HTMLElement {
  const root = document.createElement("div")
  scroller.append(root)
  return root
}

afterEach(() => {
  document.body.replaceChildren()
})

describe("brushScroller（筆先を画面の中に保つ）", () => {
  it("筆先が下の縁に近づいたら、その差だけ器を送る", () => {
    const scroller = scrollerWith({ top: 0, bottom: 500 })
    scroller.scrollTop = 100

    // 下の縁（500）から 96px の内側は 404。450 はそれを 46px 超えている。
    brushScroller(rootIn(scroller))({ x: 0, top: 430, bottom: 450 })

    expect(scroller.scrollTop).toBe(146)
  })

  it("筆先が上の縁に近づいたら、逆へ送る", () => {
    const scroller = scrollerWith({ top: 0, bottom: 500 })
    scroller.scrollTop = 300

    // 上の縁（0）から 96px の内側は 96。50 はそれより 46px 上にある。
    brushScroller(rootIn(scroller))({ x: 0, top: 50, bottom: 70 })

    expect(scroller.scrollTop).toBe(254)
  })

  it("縁から離れているあいだは動かさない", () => {
    const scroller = scrollerWith({ top: 0, bottom: 500 })
    scroller.scrollTop = 100

    brushScroller(rootIn(scroller))({ x: 0, top: 200, bottom: 220 })

    expect(scroller.scrollTop).toBe(100)
  })

  it("筆先が無い（出し切った）ときは動かさない", () => {
    const scroller = scrollerWith({ top: 0, bottom: 500 })
    scroller.scrollTop = 100

    brushScroller(rootIn(scroller))(undefined)

    expect(scroller.scrollTop).toBe(100)
  })

  it("転がる祖先が無ければページ自身を送る", () => {
    const root = document.createElement("div")
    document.body.append(root)

    // 器を見つけられずに投げたり、根そのものを送ったりしない。
    expect(() => {
      brushScroller(root)({ x: 0, top: 10, bottom: 20 })
    }).not.toThrow()
    expect(root.scrollTop).toBe(0)
  })
})
