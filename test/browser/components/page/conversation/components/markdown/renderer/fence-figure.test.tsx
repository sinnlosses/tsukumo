import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import {
  FenceFigure,
  isFenceFigureLanguage,
  type FenceFigureLanguage,
} from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/fence-figure.tsx"
import { stubIntersectionObserver } from "../../../../../../../fixture/intersection.ts"

vi.mock(
  "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/vendor-script.ts",
  () => ({ loadVendorScript: () => new Promise(() => {}), preloadVendorScript: () => {} }),
)

beforeAll(() => {
  stubIntersectionObserver(false)
})

afterEach(() => {
  cleanup()
})

const GAUGE = '{"kind":"numberLine","title":"架空","unit":"分","values":[1,2]}'
const SCATTER =
  '{"kind":"scatter","title":"架空","xName":"x","yName":"y","points":[{"x":1,"y":2,"label":"a","outlier":false}]}'
const HISTOGRAM =
  '{"kind":"histogram","title":"架空","unit":"分","bins":[{"from":0,"to":1,"count":2}]}'

const SPECS = {
  mermaid: "sequenceDiagram\n  A->>B: 架空\n",
  chart: '{"type":"bar","data":{"labels":[],"datasets":[]},"options":{}}',
  "number-line": GAUGE,
  bullet: GAUGE,
  scatter: SCATTER,
  histogram: HISTOGRAM,
} as const satisfies Record<FenceFigureLanguage, string>

const MARKERS = {
  mermaid: ".mermaid",
  chart: ".chart-block",
  "number-line": "pre, svg",
  bullet: "pre, svg",
  scatter: "pre, svg[data-plot='scatter']",
  histogram: "pre, svg[data-plot='histogram']",
} as const satisfies Record<FenceFigureLanguage, string>

const LANGUAGES = [
  "mermaid",
  "chart",
  "number-line",
  "bullet",
  "scatter",
  "histogram",
] as const satisfies readonly FenceFigureLanguage[]

describe("FenceFigure", () => {
  it.each(LANGUAGES)("%s は対応する部品を描く", (language) => {
    const { container } = render(<FenceFigure language={language} spec={SPECS[language]} />)

    expect(container.querySelector(MARKERS[language])).not.toBeNull()
  })

  it("図の言語だけを見分ける", () => {
    expect(LANGUAGES.every((language) => isFenceFigureLanguage(language))).toBe(true)
    expect(
      ["ts", "text", "", undefined].filter((language) => isFenceFigureLanguage(language)),
    ).toEqual([])
  })
})
