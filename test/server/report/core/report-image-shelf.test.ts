import { describe, expect, it } from "vitest"

import {
  createReportImageShelf,
  MAX_SHELVED_REPORT_IMAGE_BYTES,
  type ReportImage,
  releasedReportToolUseIds,
} from "../../../../src/server/report/core/report-image-shelf.ts"
import type { ReportSection } from "../../../../src/shared/report/report-block.ts"
import { reportRecord, requestRecord } from "../../../fixture/session-record.ts"

// 画像は架空のバイト列（実物の画像は使わない）。
function fictionalImage(bytes: number): ReportImage {
  return { mediaType: "image/png", content: new Uint8Array(bytes) }
}

function imageSections(...paths: readonly string[]): readonly ReportSection[] {
  return [
    {
      heading: "",
      blocks: [
        ...paths.map((path) => ({ kind: "image" as const, path, caption: "", fold: "" })),
        { kind: "text", text: "架空の本文。", fold: "" },
      ],
    },
  ]
}

describe("createReportImageShelf", () => {
  it("読めた画像だけを置き、同じパスは1回だけ読む", () => {
    const shelf = createReportImageShelf()
    const read: string[] = []
    const image = fictionalImage(3)

    shelf.shelve("toolu_a", imageSections("架空/a.png", "架空/無い.png", "架空/a.png"), (path) => {
      read.push(path)
      return path === "架空/a.png" ? image : undefined
    })

    expect(read).toEqual(["架空/a.png", "架空/無い.png"])
    expect(shelf.find("toolu_a", "架空/a.png")).toEqual(image)
    expect(shelf.find("toolu_a", "架空/無い.png")).toBeUndefined()
    expect(shelf.find("toolu_b", "架空/a.png")).toBeUndefined()
  })

  it("合計が上限を超えたら古いレポートから捨て、いま置いたレポートは残す", () => {
    const shelf = createReportImageShelf()
    const half = fictionalImage(MAX_SHELVED_REPORT_IMAGE_BYTES / 2)

    shelf.shelve("toolu_old", imageSections("a.png"), () => half)
    shelf.shelve("toolu_mid", imageSections("a.png"), () => half)
    shelf.shelve("toolu_new", imageSections("a.png"), () => fictionalImage(1))

    expect(shelf.find("toolu_old", "a.png")).toBeUndefined()
    expect(shelf.find("toolu_mid", "a.png")).toBeDefined()
    expect(shelf.find("toolu_new", "a.png")).toBeDefined()

    shelf.shelve("toolu_huge", imageSections("a.png"), () =>
      fictionalImage(MAX_SHELVED_REPORT_IMAGE_BYTES + 1),
    )

    expect(shelf.find("toolu_mid", "a.png")).toBeUndefined()
    expect(shelf.find("toolu_new", "a.png")).toBeUndefined()
    expect(shelf.find("toolu_huge", "a.png")).toBeDefined()
  })

  it("release でレポートの画像をまとめて捨てる", () => {
    const shelf = createReportImageShelf()
    shelf.shelve("toolu_a", imageSections("a.png", "b.png"), () => fictionalImage(1))

    shelf.release(["toolu_a", "toolu_unknown"])

    expect(shelf.find("toolu_a", "a.png")).toBeUndefined()
    expect(shelf.find("toolu_a", "b.png")).toBeUndefined()
  })
})

describe("releasedReportToolUseIds", () => {
  it("前の記録にあって後の記録に無いレポートの id を返す", () => {
    const kept = { ...reportRecord(), toolUseId: "toolu_kept" }
    const dropped = { ...reportRecord(), toolUseId: "toolu_dropped" }
    const added = { ...reportRecord(), toolUseId: "toolu_added" }

    expect(
      releasedReportToolUseIds([requestRecord(), dropped, kept], [kept, requestRecord(), added]),
    ).toEqual(["toolu_dropped"])
  })
})
