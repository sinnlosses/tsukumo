// 最終レポートの段ごとの所要時間（1本の帯と一覧）の形と、描く順に並べ終えた値。

import { formatElapsed, formatMeasured, type MeasuredTime } from "../utils/elapsed-time.ts"
import { plainInline } from "./report-inline-markdown.ts"

/**
 * 時間を出さない理由。`none` は理由が無い（測れたか、測れなかった「不明」）。
 * `not-started` は止めて終えた依頼で後の段を呼ばなかった段、`skipped` は要らず飛ばした段。どちらも `duration` は `unknown`。
 */
export type PhaseAbsence = "none" | "not-started" | "skipped"

/** 段1つの所要時間。`label` は段の見出しの字（「2/4 段の名前」）、`start` は依頼の頭からの開始。 */
export type PhaseDuration = {
  readonly label: string
  readonly start: MeasuredTime
  readonly duration: MeasuredTime
  readonly absence: PhaseAbsence
}

/**
 * 帯と一覧の1行ぶん。段の行か、並列の段の行。
 * 並列の段の行の `label` は「並列 2–3」、`start` と `wall` は並列の段の壁時計の開始と所要、`phases` は中の段。
 */
export type PhaseTimeRow =
  | ({ readonly kind: "phase" } & PhaseDuration)
  | {
      readonly kind: "parallel"
      readonly label: string
      readonly start: MeasuredTime
      readonly wall: MeasuredTime
      readonly absence: PhaseAbsence
      readonly phases: readonly PhaseDuration[]
    }

/**
 * 段ごとの所要時間を描く順に並べ終えた値。段が無ければ `none`。
 * 字（逃がす前の素の字）・%・見た目の種類まで決めてあり、描く側は算術をしない。
 */
export type PhaseTimesView =
  | { readonly kind: "none" }
  | {
      readonly kind: "times"
      /** 見出しの行の「計 …」の字。 */
      readonly totalText: string
      readonly chart: PhaseChartView
      readonly rows: readonly PhaseListEntryView[]
    }

/** 並列の段が無い回は1本の帯、ある回は1行1段の横棒（waterfall）。 */
export type PhaseChartView =
  | { readonly kind: "band"; readonly regions: readonly PhaseBandRegionView[] }
  | { readonly kind: "waterfall"; readonly lines: readonly PhaseWaterfallLineView[] }

/** 帯の1区間。`flexGrow` は区間の時間（ミリ秒）。測れない区間は固定幅の斜線。 */
export type PhaseBandRegionView =
  | {
      readonly kind: "segment"
      readonly title: string
      readonly longest: boolean
      readonly flexGrow: number
    }
  | { readonly kind: "unknown"; readonly title: string }

/** waterfall の1行。段の棒1本か、並列の段の包み（壁時計の囲みと中の段の棒）。 */
export type PhaseWaterfallLineView =
  | PhaseWaterfallBarView
  | { readonly kind: "group"; readonly items: readonly PhaseWaterfallGroupItemView[] }

/** 並列の段の包みの中身。壁時計が測れない包みには `wall` を置かない。 */
export type PhaseWaterfallGroupItemView =
  | {
      readonly kind: "wall"
      readonly title: string
      readonly longest: boolean
      readonly marginLeftPercent: number
      readonly widthPercent: number
    }
  | PhaseWaterfallBarView

/** waterfall の棒1本。`unknown` は開始か所要が測れなかった斜線の欠片。 */
export type PhaseWaterfallBarView = {
  readonly kind: "bar"
  readonly title: string
  readonly mark: "plain" | "longest" | "unknown"
  readonly marginLeftPercent: number
  readonly widthPercent: number
}

/** 一覧の1項目。段の行か、並列の段の行と字下げする中の段の行の包み。 */
export type PhaseListEntryView =
  | { readonly kind: "row"; readonly row: PhaseListRowView }
  | {
      readonly kind: "group"
      readonly head: PhaseListRowView
      readonly inner: readonly PhaseListRowView[]
    }

/** 一覧の1行。`inner` の行は頭の印を持たない。`ratioText` は空欄なら空文字。 */
export type PhaseListRowView = {
  readonly inner: boolean
  readonly longest: boolean
  readonly unknown: boolean
  readonly label: PhaseLabelView
  readonly valueText: string
  readonly ratioText: string
}

/** 段の見出しの字。「2/4 段の名前」の形なら番号と名前に分ける。 */
export type PhaseLabelView =
  | { readonly kind: "numbered"; readonly num: string; readonly name: string }
  | { readonly kind: "plain"; readonly text: string }

/**
 * 段ごとの所要時間を描く順に並べる。段が無ければ `none`。
 * 見出しの行（計）・帯か横棒・一覧の順に描く。
 * 並列の段が無い回は、段ごとに1区間の1本の帯で、長さは時間の比。測れなかった段は固定幅の斜線の区間で、比には数えない。
 * 並列の段がある回は、帯の代わりに1行1段の横棒（waterfall）を置く。
 * 棒の位置は依頼の頭からの開始、長さは所要で、並列の段は親の棒を描かず、中の段の棒を壁時計の区間の囲みで包む。
 * 測れなかった段は斜線の欠片で位置だけ示す。
 * 計は段（並列の段は壁時計の1区間）の測れた区間の和、割合はその区間の時間÷計の整数%、一番長い区間だけ強める。
 * 時間を出さない区間は一覧で「未着手」「飛ばした」「不明」の字にし（{@link PhaseAbsence}）、割合は空欄にする。帯と棒の欠片の `title` も同じ字。
 * 並列の段の中の段は一覧にだけ字下げして並べ、割合は空欄にする。
 */
export function phaseTimesView(rows: readonly PhaseTimeRow[]): PhaseTimesView {
  if (rows.length === 0) {
    return { kind: "none" }
  }
  const intervals = rows.map((row) => (row.kind === "phase" ? row.duration : row.wall))
  const knownMilliseconds = intervals.map((duration) =>
    duration.kind === "known" ? duration.milliseconds : 0,
  )
  const total = knownMilliseconds.reduce((sum, milliseconds) => sum + milliseconds, 0)
  const longest = Math.max(...knownMilliseconds)
  const longestIndex = longest > 0 ? knownMilliseconds.indexOf(longest) : -1

  const chart: PhaseChartView = rows.some((row) => row.kind === "parallel")
    ? { kind: "waterfall", lines: waterfallLines(rows, longestIndex) }
    : { kind: "band", regions: bandRegions(rows, longestIndex) }
  const list = rows.map((row, index): PhaseListEntryView => {
    const duration = intervals[index] ?? { kind: "unknown" }
    const head = listRow(
      { label: row.label, start: row.start, duration, absence: row.absence },
      { total, longest: index === longestIndex, inner: false },
    )
    return row.kind === "phase"
      ? { kind: "row", row: head }
      : {
          kind: "group",
          head,
          inner: row.phases.map((phase) => listRow(phase, { total, longest: false, inner: true })),
        }
  })
  return {
    kind: "times",
    totalText: `計 ${formatElapsed(Math.round(total / 1000))}`,
    chart,
    rows: list,
  }
}

type WaterfallBar = {
  readonly label: string
  readonly start: MeasuredTime
  readonly duration: MeasuredTime
  readonly absence: PhaseAbsence
  readonly longest: boolean
  readonly wall: boolean
}

/** 開始か所要が測れなかった棒の幅（全体の%）。 */
const UNKNOWN_BAR_PERCENT = 2

/**
 * 行ごとの横棒。並列の段は中の段の棒を包みに入れ、壁時計の区間を囲みで示す。
 * 開始か所要が測れなかった棒は斜線の欠片にして、直前までの棒の終わりに置く。
 * 壁時計が測れない並列の段は囲みを置かない。
 */
function waterfallLines(
  rows: readonly PhaseTimeRow[],
  longestIndex: number,
): readonly PhaseWaterfallLineView[] {
  const barsOfRows = rows.map((row, index): readonly WaterfallBar[] =>
    row.kind === "phase"
      ? [{ ...row, longest: index === longestIndex, wall: false }]
      : [
          {
            label: row.label,
            start: row.start,
            duration: row.wall,
            absence: row.absence,
            longest: index === longestIndex,
            wall: true,
          },
          ...row.phases.map((phase) => ({ ...phase, longest: false, wall: false })),
        ],
  )
  const bars = barsOfRows.flat()
  const ends = bars.map((bar) =>
    bar.start.kind === "known" && bar.duration.kind === "known"
      ? bar.start.milliseconds + bar.duration.milliseconds
      : undefined,
  )
  const extent = Math.max(0, ...ends.filter((end) => end !== undefined))
  const percent = (milliseconds: number): number =>
    extent > 0 ? Math.round((milliseconds / extent) * 10_000) / 100 : 0
  const itemOf = (bar: WaterfallBar, barIndex: number): readonly PhaseWaterfallGroupItemView[] => {
    const title = `${plainInline(bar.label)} ${valueText(bar.duration, bar.absence)}`
    if (bar.start.kind === "known" && bar.duration.kind === "known") {
      const marginLeftPercent = percent(bar.start.milliseconds)
      const widthPercent = percent(bar.duration.milliseconds)
      return bar.wall
        ? [{ kind: "wall", title, longest: bar.longest, marginLeftPercent, widthPercent }]
        : [
            {
              kind: "bar",
              title,
              mark: bar.longest ? "longest" : "plain",
              marginLeftPercent,
              widthPercent,
            },
          ]
    }
    if (bar.wall) {
      return []
    }
    const before = Math.max(0, ...ends.slice(0, barIndex).filter((end) => end !== undefined))
    return [
      {
        kind: "bar",
        title,
        mark: "unknown",
        marginLeftPercent: Math.min(percent(before), 100 - UNKNOWN_BAR_PERCENT),
        widthPercent: UNKNOWN_BAR_PERCENT,
      },
    ]
  }
  const firstBarIndexOfRows = barsOfRows.map((_, index) =>
    barsOfRows.slice(0, index).reduce((count, rowBars) => count + rowBars.length, 0),
  )
  return rows.flatMap((row, index): readonly PhaseWaterfallLineView[] => {
    const first = firstBarIndexOfRows[index] ?? 0
    const items = (barsOfRows[index] ?? []).flatMap((bar, offset) => itemOf(bar, first + offset))
    if (row.kind === "parallel") {
      return [{ kind: "group", items }]
    }
    return items.flatMap((item) => (item.kind === "bar" ? [item] : []))
  })
}

function bandRegions(
  rows: readonly PhaseTimeRow[],
  longestIndex: number,
): readonly PhaseBandRegionView[] {
  return rows.flatMap((row, index): readonly PhaseBandRegionView[] => {
    if (row.kind !== "phase") {
      return []
    }
    const label = plainInline(row.label)
    return row.duration.kind === "known"
      ? [
          {
            kind: "segment",
            title: `${label} ${formatMeasured(row.duration)}`,
            longest: index === longestIndex,
            flexGrow: Math.round(row.duration.milliseconds),
          },
        ]
      : [{ kind: "unknown", title: `${label} ${valueText(row.duration, row.absence)}` }]
  })
}

type ListRowOptions = {
  readonly total: number
  readonly longest: boolean
  readonly inner: boolean
}

function listRow(
  { label, duration, absence }: PhaseDuration,
  { total, longest, inner }: ListRowOptions,
): PhaseListRowView {
  return {
    inner,
    longest,
    unknown: duration.kind === "unknown",
    label: labelView(label),
    valueText: valueText(duration, absence),
    ratioText:
      inner || duration.kind === "unknown"
        ? ""
        : `${String(ratioPercent(duration.milliseconds, total))}%`,
  }
}

function valueText(duration: MeasuredTime, absence: PhaseAbsence): string {
  switch (absence) {
    case "not-started":
      return "未着手"
    case "skipped":
      return "飛ばした"
    case "none":
      return formatMeasured(duration)
  }
}

function labelView(label: string): PhaseLabelView {
  const match = /^(\d+\/\d+) (.+)$/.exec(label)
  return match === null
    ? { kind: "plain", text: plainInline(label) }
    : { kind: "numbered", num: plainInline(match[1] ?? ""), name: plainInline(match[2] ?? "") }
}

function ratioPercent(milliseconds: number, total: number): number {
  return total > 0 ? Math.round((milliseconds / total) * 100) : 0
}
