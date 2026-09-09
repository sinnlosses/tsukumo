import { describe, expect, it } from "bun:test"

import {
  buildCharacterBody,
  buildIndexPage,
  buildPlaceholderBody,
  buildViewPage,
  isViewName,
  VIEW_NAMES,
  viewEventPath,
  viewPath,
} from "../src/view.ts"

describe("ビューの経路", () => {
  it("ページと更新の経路が、ビューごとに別々になる", () => {
    const paths = VIEW_NAMES.map((view) => viewPath(view))
    const eventPaths = VIEW_NAMES.map((view) => viewEventPath(view))

    expect(new Set([...paths, ...eventPaths]).size).toBe(paths.length + eventPaths.length)
  })

  it("知らないビュー名を弾く", () => {
    expect(isViewName("character")).toBe(true)
    expect(isViewName("balloon")).toBe(false)
  })
})

describe("ビューのページ", () => {
  it("本文を埋め込み、そのビューの更新の経路を購読する", () => {
    const page = buildViewPage("character", "<p>こんにちは</p>")

    expect(page).toStartWith("<!doctype html>")
    expect(page).toContain("<p>こんにちは</p>")
    expect(page).toContain(`new EventSource("${viewEventPath("character")}")`)
  })

  it("一覧ページから3つのビューすべてに辿れる", () => {
    const page = buildIndexPage()

    for (const view of VIEW_NAMES) {
      expect(page).toContain(`href="${viewPath(view)}"`)
    }
  })
})

describe("ビューの本文", () => {
  it("発話をそのまま出さず、HTML として無害な形にして埋め込む", () => {
    const body = buildCharacterBody("［表情: 通常］", '<script>alert("x")</script>')

    expect(body).not.toContain("<script>")
    expect(body).toContain("&lt;script&gt;")
  })

  it("発話がまだ無いときはプレースホルダを出す", () => {
    const body = buildCharacterBody("［表情: 通常］", undefined)

    expect(body).toContain("まだ発話がありません")
  })

  it("中身が未定のビューは、準備中であることだけを出す", () => {
    expect(buildPlaceholderBody("sidebar")).toContain("準備中")
  })
})
