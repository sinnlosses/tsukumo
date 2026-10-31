import { afterEach, describe, expect, it, vi } from "vitest"

import { revealTimingOf } from "../../../../src/browser/domain/reveal-speed.ts"
import { startReveal } from "../../../../src/browser/domain/reveal/start-reveal.ts"

// 時計と requestAnimationFrame を手で進めて、`tick` の分岐（塊を出し切る・書き終える）を試す。

/** 100字の節を `count` 個並べた本文（標準の速さで1節 4000ms。1節だけだと短いレポートとして演出されない）。 */
function sectionsRoot(count: number): HTMLElement {
  const root = document.createElement("div")
  for (let index = 0; index < count; index += 1) {
    const region = document.createElement("div")
    region.setAttribute("data-report-region", "section")
    region.setAttribute("data-report-section", String(index))
    const paragraph = document.createElement("p")
    paragraph.textContent = "あ".repeat(100)
    region.append(paragraph)
    root.append(region)
  }
  document.body.append(root)
  return root
}

/** 積まれたフレームの呼び出しを1回ずつ手で回す。 */
function stubFrames(): { readonly run: () => void } {
  const queue: FrameRequestCallback[] = []
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => queue.push(callback))
  vi.stubGlobal("cancelAnimationFrame", () => {
    queue.length = 0
  })
  return {
    run: () => {
      const callbacks = queue.splice(0)
      for (const callback of callbacks) {
        callback(0)
      }
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ""
})

describe("startReveal（偽の時計）", () => {
  it("時計が塊の終わりに届くまでは塊を隠したまま、届いたフレームで出し切って演出を終える", () => {
    const frames = stubFrames()
    let time = 1000
    const root = sectionsRoot(2)
    const paragraph = root.querySelector("p")

    startReveal(root, 1, revealTimingOf("standard"), () => time)
    expect(root.hasAttribute("data-revealing")).toBe(true)
    expect(paragraph?.style.clipPath).not.toBe("")

    time += 1000
    frames.run()
    expect(root.hasAttribute("data-revealing")).toBe(true)

    time += 10_000
    frames.run()
    expect(root.hasAttribute("data-revealing")).toBe(false)
    expect(paragraph?.style.clipPath).toBe("")
  })

  it("起点は呼んだ時点の時計で、そこからの経過で進む", () => {
    const frames = stubFrames()
    let time = 5_000_000
    const root = sectionsRoot(2)

    startReveal(root, 1, revealTimingOf("standard"), () => time)
    frames.run()

    expect(root.hasAttribute("data-revealing")).toBe(true)
  })
})
