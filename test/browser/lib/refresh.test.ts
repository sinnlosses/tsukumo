import { beforeEach, describe, expect, it } from "bun:test"

import { applyRefresh } from "../../../src/browser/lib/refresh.ts"

// `page` の側（`window.location.reload()`）は借りている DOM では確かめられないので、
// ここは `style`（CSS だけを取り直す）の側だけを守る。ページごと読み込み直されることは実機で
// 見る（docs/architecture.md「手で確かめること」）。

function linkHrefs(): readonly string[] {
  return [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(
    (link) => link.href,
  )
}

beforeEach(() => {
  document.head.innerHTML = `
<link rel="stylesheet" href="/assets/style.css">
<link rel="stylesheet" href="/vendor/highlight-theme.min.css">
<link rel="icon" href="/favicon.ico">
`
})

describe("applyRefresh（style）", () => {
  it("stylesheet の href に版のクエリを足して取り直させる", () => {
    applyRefresh("style")

    const hrefs = linkHrefs()
    expect(hrefs).toHaveLength(2)
    for (const href of hrefs) {
      expect(new URL(href).searchParams.get("r")).not.toBeNull()
    }
    expect(new URL(hrefs[0] ?? "").pathname).toBe("/assets/style.css")
  })

  it("stylesheet でない link には触らない", () => {
    applyRefresh("style")

    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    expect(new URL(icon?.href ?? "").search).toBe("")
  })

  it("二度続けて呼んでもクエリが増えず、値だけが入れ替わる", () => {
    applyRefresh("style")
    const first = new URL(linkHrefs()[0] ?? "")
    applyRefresh("style")
    const second = new URL(linkHrefs()[0] ?? "")

    expect([...second.searchParams.keys()]).toEqual([...first.searchParams.keys()])
  })
})
