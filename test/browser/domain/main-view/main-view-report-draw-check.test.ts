// `reportDrawsAnything` が、欄の Markdown ではなく面の値から「描くものがあるか」を数えること。
import { describe, expect, it } from "vitest"

import {
  finalReportBody,
  reportDrawsAnything,
} from "../../../../src/browser/domain/main-view/main-view-report-body.ts"
import type {
  MainViewA2uiReport,
  MainViewReportBody,
  MainViewReportRegions,
} from "../../../../src/shared/session/main-view-shape.ts"
import { noRootA2ui } from "../../../fixture/main-view-entry.ts"

/** 根の `Report` があり、頭もお願いも節も図も振り返りも無い面。 */
const EMPTY_SURFACE: Extract<MainViewA2uiReport, { readonly kind: "surface" }> = {
  kind: "surface",
  components: [],
  sections: {},
  markdownLeaves: {},
  leafValues: {},
  figure: { kind: "none" },
  retrospective: { kind: "none" },
  imageSource: { kind: "none" },
  head: noRootA2ui().head,
  favor: { id: "favor-toolu_fictional", text: "" },
}

/** 欄の Markdown は空のまま、面の値だけを替えて確かめる。 */
const regionsWith = (a2ui: MainViewA2uiReport): MainViewReportRegions => ({
  kind: "regions",
  head: "",
  finalHead: "",
  sections: [],
  retrospective: "",
  favor: { id: "favor-toolu_fictional", markdown: "" },
  a2ui,
})

const surface = (overrides: Partial<typeof EMPTY_SURFACE>): MainViewA2uiReport => ({
  ...EMPTY_SURFACE,
  ...overrides,
})

describe("reportDrawsAnything", () => {
  it("頭もお願いも節も無い report の本文は、描くものが無い", () => {
    expect(reportDrawsAnything(regionsWith(noRootA2ui()))).toBe(false)
    expect(reportDrawsAnything(regionsWith(surface({})))).toBe(false)
  })

  it("結論・お願い・本文の節・図・振り返りのどれか1つでもあれば描く", () => {
    const leaves = {
      kind: "leaves",
      regionId: 0,
      heading: "",
      headingText: "",
      entries: [{ kind: "text", markdown: "架空の。" }],
    } as const
    expect(reportDrawsAnything(regionsWith(noRootA2ui("架空の結論。")))).toBe(true)
    expect(
      reportDrawsAnything(
        regionsWith({
          ...noRootA2ui(),
          favor: { id: "favor-toolu_fictional", text: "架空のお願い。" },
        }),
      ),
    ).toBe(true)
    expect(
      reportDrawsAnything(regionsWith(surface({ sections: { p1: { regionId: 0, heading: "" } } }))),
    ).toBe(true)
    expect(reportDrawsAnything(regionsWith(surface({ figure: leaves })))).toBe(true)
    expect(reportDrawsAnything(regionsWith(surface({ retrospective: leaves })))).toBe(true)
  })

  it("最終のときだけ持つ段ごとの所要時間と変更ファイルも、頭の中身として数える", () => {
    const plain = regionsWith(noRootA2ui())
    const finalStatus = {
      phaseTimes: { kind: "none" },
      changedFiles: { kind: "files", count: 1, rows: [], totals: [] },
    } as const
    const withFinal: MainViewReportBody = {
      ...plain,
      a2ui: { ...plain.a2ui, head: { ...plain.a2ui.head, finalStatus } },
    }

    expect(reportDrawsAnything(withFinal)).toBe(false)
    expect(reportDrawsAnything(finalReportBody(withFinal))).toBe(true)
  })

  it("Markdown 1本の本文は、空白だけでなければ描く", () => {
    expect(reportDrawsAnything({ kind: "markdown", markdown: "架空の本文" })).toBe(true)
    expect(reportDrawsAnything({ kind: "markdown", markdown: "  " })).toBe(false)
  })
})
