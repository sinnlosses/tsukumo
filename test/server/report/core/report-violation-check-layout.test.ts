import { describe, expect, it } from "vitest"

import { reportRejectionText } from "../../../../src/server/report/core/report-rejection.ts"
import { reportViolations } from "../../../../src/server/report/core/report-violation-check.ts"
import type { ReportBlock, ReportSection } from "../../../../src/shared/report/report-block.ts"
import {
  draft,
  kinds,
  markdown,
  note,
  reportDraftText,
} from "../../../fixture/report-draft-block.ts"

describe("reportViolations", () => {
  describe("note の塊は1〜2個まで", () => {
    it("3つあれば違反", () => {
      expect(reportViolations(draft([note(), note(), note()]))).toEqual([
        { kind: "too-many-notes", count: 3 },
      ])
    })

    it("2つなら違反にしない", () => {
      expect(kinds(draft([note(), note()]))).toEqual([])
    })
  })

  describe("note は隣接させず、見出しの直後に置かない", () => {
    const info = (): ReportBlock => ({
      kind: "note",
      tone: "info",
      text: "架空の一文。",
      fold: "",
      aside: "",
    })

    it("info が隣り合えば違反", () => {
      expect(reportViolations(draft([info(), info()]))).toEqual([
        { kind: "crowded-notes", count: 1 },
      ])
    })

    it("間に別の塊があれば通る", () => {
      expect(kinds(draft([info(), reportDraftText("架空の段落。"), info()]))).toEqual([])
    })

    it("見出しのある節の先頭の note は違反、見出しの無い節の先頭は通る", () => {
      const titled: readonly ReportSection[] = [
        { heading: "架空の見出し", shapeTag: "unspecified", blocks: [info()] },
      ]
      expect(kinds(draft([], "架空の結論。", titled))).toEqual(["crowded-notes"])
      expect(kinds(draft([info()]))).toEqual([])
    })

    it("warn / ng は隣接も見出しの直後も例外", () => {
      const ng = (): ReportBlock => ({
        kind: "note",
        tone: "ng",
        text: "架空の一文。",
        fold: "",
        aside: "",
      })
      const titled: readonly ReportSection[] = [
        { heading: "架空の見出し", shapeTag: "unspecified", blocks: [ng(), note()] },
      ]
      expect(kinds(draft([], "架空の結論。", titled))).toEqual([])
    })
  })

  describe("fold と details を入れ子にしない", () => {
    it("fold を持つ markdown の塊が details を含めば違反", () => {
      const block: ReportBlock = {
        kind: "markdown",
        markdown: "<details><summary>架空</summary>\n\n架空の本文\n\n</details>",
        fold: "架空の畳み",
        aside: "",
      }
      expect(reportViolations(draft([block]))).toEqual([{ kind: "nested-fold", count: 1 }])
    })

    it("details の中の details は違反", () => {
      const nested = "<details>\n<details>\n\n架空\n\n</details>\n</details>"
      expect(kinds(draft([markdown(nested)]))).toEqual(["nested-fold"])
    })

    it("fold の無い単独の details は通る", () => {
      expect(kinds(draft([markdown("<details>\n\n架空\n\n</details>")]))).toEqual([])
    })

    it("fold を持つ塊のインラインコードの <details> は details にしない", () => {
      const block: ReportBlock = {
        kind: "markdown",
        markdown: "架空の `<details>` の形。",
        fold: "架空の畳み",
        aside: "",
      }
      expect(kinds(draft([block]))).toEqual([])
    })
  })

  describe("候補は採る → 検討 → 採らないの順", () => {
    const options = (verdicts: readonly ("adopt" | "consider" | "reject")[]): ReportBlock => ({
      kind: "options",
      title: "架空の比較",
      items: verdicts.map((verdict) => ({ name: "架空", verdict, reason: "架空の理由。" })),
      fold: "",
      aside: "",
    })

    it("採る候補より前に別の判定があれば違反", () => {
      expect(
        reportViolations(draft([options(["consider", "adopt"]), options(["reject", "consider"])])),
      ).toEqual([{ kind: "unordered-options", count: 2 }])
    })

    it("順に並んでいれば、抜けている判定や同じ判定の連続があっても通る", () => {
      expect(
        kinds(draft([options(["adopt", "adopt", "reject"]), options(["consider", "reject"])])),
      ).toEqual([])
    })
  })

  describe("beforeAfter の画像の側の region", () => {
    const region = { left: 10, top: 20, width: 30, height: 40 }
    type Region = typeof region
    const withRegion = (before: readonly Region[], after: readonly Region[]): ReportBlock => ({
      kind: "beforeAfter",
      title: "架空の前後",
      before: { kind: "image", path: "架空/before.png", ...before.map((r) => ({ region: r }))[0] },
      after: { kind: "image", path: "架空/after.png", ...after.map((r) => ({ region: r }))[0] },
      fold: "",
      aside: "",
    })

    it("region が無い側、範囲内の側（端に接するのは収まり）は通る", () => {
      expect(kinds(draft([withRegion([], [])]))).toEqual([])
      expect(
        kinds(draft([withRegion([region], [{ left: 0, top: 0, width: 100, height: 100 }])])),
      ).toEqual([])
    })

    it.each([
      ["left が負", { ...region, left: -1 }],
      ["top が負", { ...region, top: -1 }],
      ["left + width が100超", { ...region, left: 80 }],
      ["top + height が100超", { ...region, top: 70 }],
      ["幅が0", { ...region, width: 0 }],
      ["高さが負", { ...region, height: -5 }],
    ])("%s は region-range で、塊の数を数える", (_, bad) => {
      expect(reportViolations(draft([withRegion([bad], []), withRegion([region], [bad])]))).toEqual(
        [{ kind: "region-range", count: 2 }],
      )
      expect(reportRejectionText([{ kind: "region-range", count: 1 }])).toContain("`region`")
    })
  })
})
