import { describe, expect, it } from "vitest"

import { gridColumnCount } from "../../../../../src/browser/features/report/domain/grid-column-count.ts"

/** 本文の字は 14px、列の間は 12px。幅は紙の内側（1400×900 で 724.92px、1920×1080 で 882px）。 */
const measure = (childCount: number, inlineSize: number, besideCard = false) =>
  gridColumnCount({ childCount, inlineSize, fontSize: 14, gap: 12, besideCard })

describe("gridColumnCount", () => {
  it.each([
    ["1400×900 の紙に子 3 つは 3 列", 3, 724.92, 3],
    ["1400×900 の紙に子 4 つは 3＋1 に割らず 2×2", 4, 724.92, 2],
    ["1920×1080 の紙に子 4 つは 4 列", 4, 882, 4],
    ["1920×1080 の紙に子 5 つは 3 と 2", 5, 882, 3],
    ["1920×1080 の紙に子 6 つは 3 と 3", 6, 882, 3],
    ["390×844 の狭い器は 1 列に折り返す", 4, 342, 1],
    ["まだ置かれていない（幅 0）は 1 列", 4, 0, 1],
  ] as const)("%s", (_, childCount, inlineSize, expected) => {
    expect(measure(childCount, inlineSize)).toBe(expected)
  })

  it("余白の札の横では、広い器でも 1 列に積む", () => {
    expect(measure(4, 882, true)).toBe(1)
  })
})
