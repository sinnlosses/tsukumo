// 地の文の語と同じ節の `Chart` の項目名を結ぶ規則。比べは NFKC にして空白を除いた字でする。

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"

export type ChartTermTarget = {
  readonly chartId: string
  readonly index: number
}

export type ChartTermSpan = {
  readonly start: number
  readonly end: number
  readonly term: string
}

export type ChartTermLinks = ReadonlyMap<string, ChartTermTarget>

/** 揃えた語 → 図と項目の位置。1字の語と、2つ以上の図に現れる語は外す。 */
export function chartTermLinksOf(
  charts: readonly { readonly id: string; readonly labels: readonly string[] }[],
): ChartTermLinks {
  const found = new Map<string, ChartTermTarget>()
  const ambiguous = new Set<string>()
  for (const chart of charts) {
    chart.labels.forEach((label, index) => {
      const term = normalizeChartTerm(label)
      if (term.length <= 1) {
        return
      }
      const existing = found.get(term)
      if (existing === undefined) {
        found.set(term, { chartId: chart.id, index })
      } else if (existing.chartId !== chart.id) {
        ambiguous.add(term)
      }
    })
  }
  for (const term of ambiguous) {
    found.delete(term)
  }
  return found
}

/** 節の子の ID の並びから、入れ子の中まで `Chart` の部品を集める（`ChartGrid` は集めない）。 */
export function chartPartsOfSection(
  ids: readonly string[],
  parts: ReadonlyMap<string, A2uiReportComponent>,
): readonly Extract<A2uiReportComponent, { readonly component: "Chart" }>[] {
  return ids.flatMap((id) => {
    const part = parts.get(id)
    if (part === undefined) {
      return []
    }
    switch (part.component) {
      case "Chart":
        return [part]
      case "Section":
      case "Row":
      case "Column":
        return chartPartsOfSection(part.children, parts)
      case "Card":
        return chartPartsOfSection([part.child], parts)
      case "Tabs":
        return chartPartsOfSection(
          part.tabs.map((tab) => tab.child),
          parts,
        )
      default:
        return []
    }
  })
}

/** 地の文の中の語の位置（元の字のもの）。長い語を先に採り、重ならない。 */
export function chartTermSpans(text: string, terms: ChartTermLinks): readonly ChartTermSpan[] {
  // 空白を除いた字 → 元の字の位置 の対応を作る（NFKC は1字ずつかけて位置を保つ）
  const folded: string[] = []
  const starts: number[] = []
  const ends: number[] = []
  let offset = 0
  for (const char of text) {
    const normalized = normalizeChartTerm(char)
    for (const piece of normalized) {
      folded.push(piece)
      starts.push(offset)
      ends.push(offset + char.length)
    }
    offset += char.length
  }
  const haystack = folded.join("")
  // folded は code point 単位で積んだので、位置は code point の添字で引く
  const codePoints = [...haystack]
  const candidates: { start: number; end: number; term: string }[] = []
  for (const term of terms.keys()) {
    const needle = [...term]
    for (let i = 0; i + needle.length <= codePoints.length; i += 1) {
      if (needle.every((piece, k) => codePoints[i + k] === piece)) {
        candidates.push({ start: starts[i] ?? 0, end: ends[i + needle.length - 1] ?? 0, term })
      }
    }
  }
  candidates.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start)
  const taken: ChartTermSpan[] = []
  for (const candidate of candidates) {
    if (taken.every((span) => candidate.end <= span.start || span.end <= candidate.start)) {
      taken.push(candidate)
    }
  }
  return taken.toSorted((a, b) => a.start - b.start)
}

const WHITESPACE = /\s/gu

function normalizeChartTerm(text: string): string {
  return text.normalize("NFKC").replaceAll(WHITESPACE, "")
}
