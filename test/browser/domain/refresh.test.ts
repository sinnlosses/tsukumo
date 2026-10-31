import { describe, expect, it, vi } from "vitest"

import { applyRefresh } from "../../../src/browser/domain/refresh.ts"

function environmentOf(hrefs: readonly string[], now = 1234) {
  const links = hrefs.map((href) => ({ href }))
  const reloadPage = vi.fn<() => void>()
  return { links, reloadPage, environment: { reloadPage, stylesheetLinks: links, now: () => now } }
}

describe("applyRefresh", () => {
  it("page はページを読み込み直し、link には触らない", () => {
    const { links, reloadPage, environment } = environmentOf(["http://localhost/a.css"])

    applyRefresh("page", environment)

    expect(reloadPage).toHaveBeenCalledOnce()
    expect(links[0]?.href).toBe("http://localhost/a.css")
  })

  it("style は読み込み直さず、href に時刻の版のクエリを足して取り直させる", () => {
    const { links, reloadPage, environment } = environmentOf([
      "http://localhost/assets/style.css",
      "http://localhost/vendor/highlight-theme.min.css",
    ])

    applyRefresh("style", environment)

    expect(reloadPage).not.toHaveBeenCalled()
    expect(links.map((link) => link.href)).toEqual([
      "http://localhost/assets/style.css?r=1234",
      "http://localhost/vendor/highlight-theme.min.css?r=1234",
    ])
  })

  it("二度続けて呼んでもクエリが増えず、値だけが入れ替わる", () => {
    const { links, environment } = environmentOf(["http://localhost/a.css"], 1)
    applyRefresh("style", environment)

    applyRefresh("style", { ...environment, now: () => 2 })

    expect(links[0]?.href).toBe("http://localhost/a.css?r=2")
  })
})
