import { describe, expect, it } from "vitest"

import {
  isShelvedImageUrl,
  readReportImageRoute,
  REPORT_IMAGE_PATH_PREFIX,
  REPORT_IMAGE_SRC_PATTERN,
  reportImagePath,
} from "../../../src/shared/report/report-image.ts"

function routeOf(path: string): string {
  return path.slice(REPORT_IMAGE_PATH_PREFIX.length)
}

describe("reportImagePath と readReportImageRoute", () => {
  it.each(["after.png", "架空/画面の after.png", "/tmp/架空 #1.png", "../上/a?b.png"])(
    "組んだ経路を読むと同じ鍵の組に戻る（%s）",
    (path) => {
      const route = reportImagePath("toolu_01-fictional", path)

      expect(REPORT_IMAGE_SRC_PATTERN.test(route)).toBe(true)
      expect(route.slice(REPORT_IMAGE_PATH_PREFIX.length).split("/")).toHaveLength(2)
      expect(readReportImageRoute(routeOf(route))).toEqual({
        toolUseId: "toolu_01-fictional",
        path,
      })
    },
  )

  it("% の崩れ・id の形の外・パスが空・長すぎるパス・区切りの無い経路は読めない", () => {
    expect(readReportImageRoute("toolu_fictional/%E3")).toBeUndefined()
    expect(readReportImageRoute("a.b/x.png")).toBeUndefined()
    expect(readReportImageRoute("/x.png")).toBeUndefined()
    expect(readReportImageRoute("toolu_fictional/")).toBeUndefined()
    expect(readReportImageRoute(`toolu_fictional/${"a".repeat(1025)}`)).toBeUndefined()
    expect(readReportImageRoute("toolu_fictional")).toBeUndefined()
  })

  it("src の検査は棚の経路だけを通し、外部の URL・data:・ほかのパスは通さない", () => {
    expect(REPORT_IMAGE_SRC_PATTERN.test("https://example.invalid/report-image/a.png")).toBe(false)
    expect(REPORT_IMAGE_SRC_PATTERN.test("data:image/png;base64,AAAA")).toBe(false)
    expect(REPORT_IMAGE_SRC_PATTERN.test("/tmp/a.png")).toBe(false)
    expect(REPORT_IMAGE_SRC_PATTERN.test("//example.invalid/report-image/a.png")).toBe(false)
  })
})

describe("isShelvedImageUrl", () => {
  it.each(["架空/a.png", "/tmp/架空/b.png", "../上/c.png"])(
    "手元のパスは棚から引く（%s）",
    (url) => {
      expect(isShelvedImageUrl(url)).toBe(true)
    },
  )

  it.each([
    "",
    "https://example.invalid/a.png",
    "//example.invalid/a.png",
    "data:image/png;base64,AAAA",
    "file:///tmp/a.png",
  ])("空・スキームか // で始まる行き先は棚から引かない（%s）", (url) => {
    expect(isShelvedImageUrl(url)).toBe(false)
  })
})
