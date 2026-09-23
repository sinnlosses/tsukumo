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

describe("brushScroller（ミニ立ち絵の立つ位置を画面の中に保つ）", () => {
  it("下端が下の縁に近づいたら、その差だけ器を送る", () => {
    const scroller = scrollerWith({ top: 0, bottom: 500 })
    scroller.scrollTop = 100

    // 下の縁（500）から 96px の内側は 404。450 はそれを 46px 超えている。
    brushScroller(rootIn(scroller)).follow({ tipBottom: 450, tipHeight: 20 })

    expect(scroller.scrollTop).toBe(146)
  })

  it("上端が上の縁に近づいたら、逆へ送る", () => {
    const scroller = scrollerWith({ top: 0, bottom: 500 })
    scroller.scrollTop = 300

    // 上端は tipBottom(70) - tipHeight(20) = 50。上の縁（0）から 96px の内側は 96。
    // 50 はそれより 46px 上にある。
    brushScroller(rootIn(scroller)).follow({ tipBottom: 70, tipHeight: 20 })

    expect(scroller.scrollTop).toBe(254)
  })

  it("縁から離れているあいだは動かさない", () => {
    const scroller = scrollerWith({ top: 0, bottom: 500 })
    scroller.scrollTop = 100

    brushScroller(rootIn(scroller)).follow({ tipBottom: 220, tipHeight: 20 })

    expect(scroller.scrollTop).toBe(100)
  })

  it("筆先が無い（出し切った）ときは動かさない", () => {
    const scroller = scrollerWith({ top: 0, bottom: 500 })
    scroller.scrollTop = 100

    brushScroller(rootIn(scroller)).follow(undefined)

    expect(scroller.scrollTop).toBe(100)
  })

  it("利用者が手で転がしたら、そのあとは送らない", () => {
    const scroller = scrollerWith({ top: 0, bottom: 500 })
    scroller.scrollTop = 100
    const brush = brushScroller(rootIn(scroller))

    window.dispatchEvent(new Event("wheel"))
    brush.follow({ tipBottom: 450, tipHeight: 20 })

    expect(scroller.scrollTop).toBe(100)
    brush.stop()
  })

  it("見張りを外したあとは、手で転がしても降りない（合図の口が残らない）", () => {
    const scroller = scrollerWith({ top: 0, bottom: 500 })
    scroller.scrollTop = 100
    const brush = brushScroller(rootIn(scroller))

    brush.stop()
    window.dispatchEvent(new Event("wheel"))
    brush.follow({ tipBottom: 450, tipHeight: 20 })

    expect(scroller.scrollTop).toBe(146)
  })

  it("帯が器より背が高いトピックでも、2回続けて follow しても scrollTop が往復しない", () => {
    const scroller = scrollerWith({ top: 0, bottom: 500 })
    const brush = brushScroller(rootIn(scroller))
    // tipHeight は report-reveal.ts が渡す見積もり（96px）。帯ぜんたい（行の多いトピックでは
    // 器の高さに迫る）ではなくこの狭い範囲だけを追うので、往復しないはず。
    brush.follow({ tipBottom: 450, tipHeight: 96 })
    const afterFirst = scroller.scrollTop

    // 2フレーム目: 送った分だけ実際のDOMも上へ動く（送った量だけ座標を詰めてもう一度渡す
    // ——report-reveal.ts が毎フレーム測り直す座標を模す）。
    brush.follow({ tipBottom: 450 - afterFirst, tipHeight: 96 })

    expect(scroller.scrollTop).toBe(afterFirst)
  })

  it("余白も含めた範囲が器に収まらないほど狭いときは、下端を優先して往復しない", () => {
    // 器の高さ(200)が tipHeight(96) + 余白×2(192) = 288 より小さい、実運用ではまず
    // 起きない極端な狭さ。それでも下端（いま書いている足元）を優先し、上端の余白は諦める。
    const scroller = scrollerWith({ top: 0, bottom: 200 })
    const brush = brushScroller(rootIn(scroller))
    brush.follow({ tipBottom: 300, tipHeight: 96 })
    const afterFirst = scroller.scrollTop

    brush.follow({ tipBottom: 300 - afterFirst, tipHeight: 96 })

    expect(scroller.scrollTop).toBe(afterFirst)
  })

  it("転がる祖先が無ければページ自身を送る", () => {
    const root = document.createElement("div")
    document.body.append(root)

    // 器を見つけられずに投げたり、根そのものを送ったりしない。
    expect(() => {
      brushScroller(root).follow({ tipBottom: 20, tipHeight: 10 })
    }).not.toThrow()
    expect(root.scrollTop).toBe(0)
  })
})
