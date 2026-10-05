import { describe, expect, it } from "vitest"

import { sanitizeSvg } from "../../../src/browser/utils/sanitize-svg.ts"

const SVG_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">'

function sanitizedBody(body: string): string {
  const sanitized = sanitizeSvg(`${SVG_OPEN}${body}</svg>`)
  if (sanitized === undefined) {
    throw new Error("SVG として読めなかった")
  }
  return sanitized
}

describe("sanitizeSvg", () => {
  it("script・style・foreignObject の要素は中身ごと落ちる", () => {
    const sanitized = sanitizedBody(
      '<script>window.mark = 1</script><style>.a { fill: red }</style><foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="window.mark = 2"/></div></foreignObject><circle r="1"/>',
    )

    expect(sanitized).not.toMatch(/script|style|foreignObject|window\.mark|onerror|<div|<img/)
    expect(sanitized).toContain('<circle r="1"/>')
  })

  it("on で始まるイベントハンドラの属性は落ちる", () => {
    const sanitized = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="window.mark = 1"><rect width="1" onclick="window.mark = 2" onmouseover="window.mark = 3"/></svg>',
    )

    expect(sanitized).not.toMatch(/onload|onclick|onmouseover|window\.mark/)
    expect(sanitized).toContain('<rect width="1"/>')
  })

  it("href・xlink:href は文書の中（#）を指すものだけが残る", () => {
    const sanitized = sanitizedBody(
      '<use href="javascript:alert(1)"/><use xlink:href="https://example.invalid/a.svg#b"/><use href="#body"/><use xlink:href="#face"/>',
    )

    expect(sanitized).not.toMatch(/javascript:|example\.invalid/)
    expect(sanitized).toContain('href="#body"')
    expect(sanitized).toContain('xlink:href="#face"')
  })

  it("image はラスタの data URL を指してよいが、SVG の data URL と外の URL は落ちる", () => {
    const sanitized = sanitizedBody(
      '<image href="data:image/png;base64,AAAA"/><image href="data:image/svg+xml;base64,AAAA"/><image href="https://example.invalid/a.png"/>',
    )

    expect(sanitized).toContain('href="data:image/png;base64,AAAA"')
    expect(sanitized).not.toMatch(/svg\+xml|example\.invalid/)
  })

  it("url( が外を指す値の属性は落ち、文書の中を指す url(#…) と var(--outfit-accent) は残る", () => {
    const sanitized = sanitizedBody(
      '<rect fill="url(https://example.invalid/a.svg#g)"/><rect style="fill: url( \'https://example.invalid\')"/><rect style="background: image-set(\'https://example.invalid\' 1x)"/><rect fill="url(#g)" style="stroke: url( \'#g\'); opacity: 0.5"/><stop stop-color="var(--outfit-accent, #b8c7ff)"/>',
    )

    expect(sanitized).not.toContain("example.invalid")
    expect(sanitized).toContain('fill="url(#g)"')
    expect(sanitized).toContain("stroke: url( '#g'); opacity: 0.5")
    expect(sanitized).toContain('stop-color="var(--outfit-accent, #b8c7ff)"')
  })

  it("animate は残るが、リンクやイベントハンドラを書き換える animate は要素ごと落ちる", () => {
    const sanitized = sanitizedBody(
      '<a href="#x"><circle r="1"/></a><animate attributeName="href" values="javascript:alert(1)"/><animate attributeName="onclick" values="alert(1)"/><animate attributeName="opacity" values="1;0.4;1" dur="1s" repeatCount="indefinite"/>',
    )

    expect(sanitized).not.toMatch(/attributeName="(href|onclick)"|javascript:|alert|<a /)
    expect(sanitized).toContain(
      '<animate attributeName="opacity" values="1;0.4;1" dur="1s" repeatCount="indefinite"/>',
    )
  })

  it("id・class・style・data-* と、グラデーションの組み立ては残る", () => {
    const body =
      '<defs><radialGradient id="body" cx="50%" cy="35%" r="70%"><stop offset="0%" stop-color="#fdfdff"/></radialGradient></defs><g id="face" class="layer" style="opacity: 0.8" data-layer="eyes"><path d="M0 0h1" fill="url(#body)" stroke-width="3"/></g>'

    expect(sanitizedBody(body)).toBe(`${SVG_OPEN}${body}</svg>`)
  })

  it("XML として読めない文字列と、根が <svg> でない文書は undefined", () => {
    expect(sanitizeSvg("<svg><circle")).toBeUndefined()
    expect(sanitizeSvg('<html xmlns="http://www.w3.org/1999/xhtml"><body/></html>')).toBeUndefined()
    expect(sanitizeSvg('<g xmlns="http://www.w3.org/2000/svg"/>')).toBeUndefined()
  })
})
