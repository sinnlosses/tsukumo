import { describe, expect, test } from "vitest"

import { formatPaperMetric, type PaperMetric } from "../../../scripts/capture/lib/paper-metric.ts"

const EMPTY: PaperMetric = {
  leftRules: 0,
  statStrips: 0,
  numberedLists: 0,
  emoji: 0,
  boldPerParagraph: { bold: 0, paragraphs: 0 },
  hueFamilies: [],
  hueFamilyCount: 0,
  readingHeight: 511,
  verdict: { kind: "absent" },
  firstFigure: { kind: "absent" },
  figures: 0,
  oversizedFigures: 0,
  diagramText: { kind: "absent" },
  stackedBlocks: {
    stats: { total: 0, stacked: 0 },
    compare: { total: 0, stacked: 0 },
    beforeAfter: { total: 0, stacked: 0 },
    options: { total: 0, stacked: 0 },
    files: { total: 0, stacked: 0 },
  },
}

function valueOf(rows: readonly string[], item: string): string | undefined {
  return rows
    .find((row) => row.startsWith(`| ${item} |`))
    ?.split("|")[2]
    ?.trim()
}

describe("formatPaperMetric", () => {
  test("見出しの2行のあとに項目ごとの行が続く", () => {
    const rows = formatPaperMetric(EMPTY)
    expect(rows.slice(0, 2)).toStrictEqual(["| 項目 | 値 |", "| --- | --- |"])
    expect(rows.every((row) => row.startsWith("| ") && row.endsWith(" |"))).toBe(true)
  })

  test("無い値は - で、段落が無いと太字の割合は出さない", () => {
    const rows = formatPaperMetric(EMPTY)
    expect(valueOf(rows, "結論の頭の高さ")).toBe("-")
    expect(valueOf(rows, "図1が最初の1画面に入る")).toBe("-")
    expect(valueOf(rows, "読む面を超える図の割合")).toBe("-")
    expect(valueOf(rows, "太字（段落あたり）")).toBe("-")
    expect(valueOf(rows, "色相の族の内訳")).toBe("-")
    expect(valueOf(rows, "svg の文字の最小 px")).toBe("-")
    expect(valueOf(rows, "11px 未満の図")).toBe("-")
  })

  test("図の文字の最小 px は小数 1 桁で、11px 未満の図は総数と並べる", () => {
    const rows = formatPaperMetric({
      ...EMPTY,
      diagramText: { kind: "at", count: 3, smallest: 6.4567, belowSmall: 2 },
    })
    expect(valueOf(rows, "svg の文字の最小 px")).toBe("6.5px")
    expect(valueOf(rows, "11px 未満の図")).toBe("2 / 3")
  })

  test("図1が最初の1画面に入るときは「はい」", () => {
    const rows = formatPaperMetric({
      ...EMPTY,
      firstFigure: { kind: "at", top: 200, inFirstScreen: true },
    })
    expect(valueOf(rows, "図1が最初の1画面に入る")).toBe("はい")
  })

  test("真偽・割合・族・縦落ちの書式", () => {
    const rows = formatPaperMetric({
      ...EMPTY,
      boldPerParagraph: { bold: 3, paragraphs: 4 },
      hueFamilies: [
        [30, 120],
        [210, 40],
      ],
      hueFamilyCount: 2,
      verdict: { kind: "at", top: 25.4 },
      firstFigure: { kind: "at", top: 640.2, inFirstScreen: false },
      figures: 3,
      oversizedFigures: 1,
      stackedBlocks: { ...EMPTY.stackedBlocks, options: { total: 2, stacked: 1 } },
    })
    expect(valueOf(rows, "太字（段落あたり）")).toBe("3 / 4段落 = 0.75")
    expect(valueOf(rows, "色相の族の内訳")).toBe("30°: 120px 210°: 40px")
    expect(valueOf(rows, "結論の頭の高さ")).toBe("25px")
    expect(valueOf(rows, "図1の上端")).toBe("640px")
    expect(valueOf(rows, "図1が最初の1画面に入る")).toBe("いいえ")
    expect(valueOf(rows, "読む面を超える図の割合")).toBe("33.3%")
    expect(valueOf(rows, "縦落ち options")).toBe("1 / 2")
  })
})
