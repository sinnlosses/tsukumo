import { describe, expect, it } from "vitest"

import { svgDataUrl } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/figure-zoom.tsx"

function svgOf(markup: string): SVGSVGElement {
  const host = document.createElement("div")
  host.innerHTML = markup
  const svg = host.querySelector("svg")
  if (svg === null) {
    throw new Error("svg が無い")
  }
  return svg
}

function decoded(url: string): string {
  return decodeURIComponent(url.slice(url.indexOf(",") + 1))
}

describe("svgDataUrl", () => {
  it("viewBox の幅と高さを実寸にし、max-width を外す", () => {
    const url = svgDataUrl(
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

  it("viewBox が無い svg は測った大きさを使う", () => {
    const text = decoded(svgDataUrl(svgOf(`<svg width="50" height="40"></svg>`)))

    expect(text).toContain('width="')
    expect(text).toContain('height="')
  })
})
