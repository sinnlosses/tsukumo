import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { SvgZoom } from "../../../../../src/browser/features/report/renderer/figure-zoom.tsx"

afterEach(() => {
  cleanup()
})

function svgOf(markup: string): SVGSVGElement {
  const host = document.createElement("div")
  host.innerHTML = markup
  const svg = host.querySelector("svg")
  if (svg === null) {
    throw new Error("svg が無い")
  }
  return svg
}

function zoomedSource(svg: SVGSVGElement): string {
  render(<SvgZoom svg={svg} onClose={() => {}} />)
  return screen.getByRole("img", { name: "図" }).getAttribute("src") ?? ""
}

function decoded(url: string): string {
  return decodeURIComponent(url.slice(url.indexOf(",") + 1))
}

describe("SvgZoom", () => {
  it("svg を viewBox の幅と高さを実寸にした data URL で見せ、max-width を外す", () => {
    const url = zoomedSource(
      svgOf(
        `<svg viewBox="0 0 160 720" width="100%" style="max-width: 160px"><rect width="1" height="1"></rect></svg>`,
      ),
    )

    expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true)
    const text = decoded(url)
    expect(text).toContain('width="160"')
    expect(text).toContain('height="720"')
    expect(text).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(text).not.toContain("max-width")
  })

  it("foreignObject の中の HTML にも字の値を書き、foreignObject ははみ出しを切らない", () => {
    const svg = svgOf(
      `<svg viewBox="0 0 100 40"><foreignObject width="80" height="20"><div><span style="font-family: Fictional Sans">架空のラベル</span></div></foreignObject></svg>`,
    )
    document.body.append(svg)

    const copy = new DOMParser().parseFromString(
      decoded(zoomedSource(svg)),
      "image/svg+xml",
    ).documentElement
    svg.remove()

    const foreignObject = copy.querySelector("foreignObject")
    expect(foreignObject?.getAttribute("style")).toContain("overflow:visible")
    expect(foreignObject?.querySelector("div")?.getAttribute("style")).toContain("font-size:")
    expect(foreignObject?.querySelector("span")?.getAttribute("style")).toContain(
      'font-family:"Fictional Sans"',
    )
  })

  it("字の縁取りを字の下に描く順を写し、根に面の色の地を敷く", () => {
    const svg = svgOf(
      `<svg viewBox="0 0 100 40" style="--surface: #123456"><text style="paint-order: stroke; stroke: #123456">架空の字</text></svg>`,
    )
    document.body.append(svg)

    const copy = new DOMParser().parseFromString(
      decoded(zoomedSource(svg)),
      "image/svg+xml",
    ).documentElement
    svg.remove()

    expect(copy.querySelector("text")?.getAttribute("style")).toContain("paint-order:stroke")
    expect(copy.getAttribute("style")).toContain("background-color:#123456")
  })

  it("viewBox が無い svg は測った大きさを使う", () => {
    const text = decoded(zoomedSource(svgOf(`<svg width="50" height="40"></svg>`)))

    expect(text).toContain('width="')
    expect(text).toContain('height="')
  })
})
