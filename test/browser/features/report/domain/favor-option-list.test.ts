import { describe, expect, it } from "vitest"

import {
  favorOptionsOf,
  hasIrreversibleOption,
} from "../../../../../src/browser/features/report/domain/favor-option-list.ts"
import type { A2uiReportComponent } from "../../../../../src/shared/report/a2ui-report-catalog.ts"

const option = { name: "架空の案", draft: "架空の下書き" }

describe("favorOptionsOf", () => {
  it("根の Report の favorOptions を取り出す", () => {
    const components: readonly A2uiReportComponent[] = [
      { id: "root", component: "Report", children: ["s"], favorOptions: [option] },
    ]

    expect(favorOptionsOf(components)).toEqual([option])
  })

  it("欄が無ければ空", () => {
    const components: readonly A2uiReportComponent[] = [
      { id: "root", component: "Report", children: ["s"] },
    ]

    expect(favorOptionsOf(components)).toEqual([])
  })
})

describe("hasIrreversibleOption", () => {
  it("戻せない印のある選択肢が1つでもあれば真", () => {
    expect(hasIrreversibleOption([option, { ...option, irreversible: true }])).toBe(true)
    expect(hasIrreversibleOption([option])).toBe(false)
  })
})
