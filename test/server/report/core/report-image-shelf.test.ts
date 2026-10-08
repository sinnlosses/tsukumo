import { describe, expect, it } from "vitest"

import {
  createReportImageShelf,
  MAX_SHELVED_REPORT_IMAGE_BYTES,
  type ReportImage,
  releasedImageToolUseIds,
  reportImagePaths,
} from "../../../../src/server/report/core/report-image-shelf.ts"
import type { ReportSection } from "../../../../src/shared/report/report-block.ts"
import type { StampedPendingAsk } from "../../../../src/shared/session-driver/pending-ask.ts"
import type { SessionRecord } from "../../../../src/shared/session/session-state.ts"
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
        ...paths.map((path) => ({
          kind: "image" as const,
          path,
          caption: "",
          notes: [],
          fold: "",
        })),
        { kind: "text", text: "架空の本文。", fold: "" },
      ],
    },
  ]
}

function questionRecord(toolUseId: string): SessionRecord {
  return { kind: "question", toolUseId, questions: [], answers: [] }
}

function pendingQuestion(id: string): StampedPendingAsk {
  return { kind: "question", id, questions: [], briefs: [], askedAt: 0 }
}

describe("createReportImageShelf", () => {
  it("読めた画像だけを置き、同じパスは1回だけ読む", () => {
    const shelf = createReportImageShelf()
    const read: string[] = []
    const image = fictionalImage(3)

    shelf.shelve("toolu_a", ["架空/a.png", "架空/無い.png", "架空/a.png"], (path) => {
      read.push(path)
      return path === "架空/a.png" ? image : undefined
    })

    expect(read).toEqual(["架空/a.png", "架空/無い.png"])
    expect(shelf.find("toolu_a", "架空/a.png")).toEqual(image)
    expect(shelf.find("toolu_a", "架空/無い.png")).toBeUndefined()
    expect(shelf.find("toolu_b", "架空/a.png")).toBeUndefined()
  })

  it("合計が上限を超えたら古く置いたものから捨て、いま置いたものは残す", () => {
    const shelf = createReportImageShelf()
    const half = fictionalImage(MAX_SHELVED_REPORT_IMAGE_BYTES / 2)

    shelf.shelve("toolu_old", ["a.png"], () => half)
    shelf.shelve("toolu_mid", ["a.png"], () => half)
    shelf.shelve("toolu_new", ["a.png"], () => fictionalImage(1))

    expect(shelf.find("toolu_old", "a.png")).toBeUndefined()
    expect(shelf.find("toolu_mid", "a.png")).toBeDefined()
    expect(shelf.find("toolu_new", "a.png")).toBeDefined()

    shelf.shelve("toolu_huge", ["a.png"], () => fictionalImage(MAX_SHELVED_REPORT_IMAGE_BYTES + 1))

    expect(shelf.find("toolu_mid", "a.png")).toBeUndefined()
    expect(shelf.find("toolu_new", "a.png")).toBeUndefined()
    expect(shelf.find("toolu_huge", "a.png")).toBeDefined()
  })

  it("release で id ごとの画像をまとめて捨てる", () => {
    const shelf = createReportImageShelf()
    shelf.shelve("toolu_a", ["a.png", "b.png"], () => fictionalImage(1))

    shelf.release(["toolu_a", "toolu_unknown"])

    expect(shelf.find("toolu_a", "a.png")).toBeUndefined()
    expect(shelf.find("toolu_a", "b.png")).toBeUndefined()
  })
})

describe("reportImagePaths", () => {
  it("image の塊のパスだけを拾い、空のパスは除く", () => {
    expect(reportImagePaths(imageSections("架空/a.png", "", "架空/b.png"))).toEqual([
      "架空/a.png",
      "架空/b.png",
    ])
  })

  it("beforeAfter の画像の側のパスも拾い、ほかの種類の側は拾わない", () => {
    const sections: readonly ReportSection[] = [
      {
        heading: "",
        blocks: [
          {
            kind: "beforeAfter",
            title: "",
            before: { kind: "image", path: "架空/before.png" },
            after: { kind: "image", path: "架空/after.png" },
            fold: "",
          },
          {
            kind: "beforeAfter",
            title: "",
            before: { kind: "points", points: ["架空の1行"] },
            after: { kind: "image", path: "" },
            fold: "",
          },
        ],
      },
    ]

    expect(reportImagePaths(sections)).toEqual(["架空/before.png", "架空/after.png"])
  })
})

describe("releasedImageToolUseIds", () => {
  it("前の記録にあって後の記録に無いレポートの id を返す", () => {
    const kept = { ...reportRecord(), toolUseId: "toolu_kept" }
    const dropped = { ...reportRecord(), toolUseId: "toolu_dropped" }
    const added = { ...reportRecord(), toolUseId: "toolu_added" }

    expect(
      releasedImageToolUseIds(
        { records: [requestRecord(), dropped, kept], pending: [] },
        { records: [kept, requestRecord(), added], pending: [] },
      ),
    ).toEqual(["toolu_dropped"])
  })

  it("答え待ちから記録へ移った質問は捨てず、答えずに答え待ちを抜けた質問と記録から落ちた質問は捨てる", () => {
    expect(
      releasedImageToolUseIds(
        { records: [], pending: [pendingQuestion("toolu_answered")] },
        { records: [questionRecord("toolu_answered")], pending: [] },
      ),
    ).toEqual([])
    expect(
      releasedImageToolUseIds(
        { records: [], pending: [pendingQuestion("toolu_denied")] },
        { records: [], pending: [] },
      ),
    ).toEqual(["toolu_denied"])
    expect(
      releasedImageToolUseIds(
        { records: [questionRecord("toolu_old")], pending: [] },
        { records: [requestRecord()], pending: [] },
      ),
    ).toEqual(["toolu_old"])
  })
})
