// メインビューの形のうち、レポートの面の頭と、図・振り返りの欄の型。

import type { ChangedFilesView } from "../report/changed-file-section.ts"
import type { LeafComponent } from "../report/report-block.ts"
import type { ReportChecksView } from "../report/report-check-view.ts"
import type { ReportMap } from "../report/report-map.ts"
import type { ReportNotDoneView } from "../report/report-not-done.ts"
import type { PhaseTimesView } from "../report/report-phase-time.ts"
import type { ReportVerification } from "../report/report-verification.ts"

/**
 * 面の頭を部分ごとに持つ値。どの部分も値で持つ。
 * `lead` は結論。`task` のあるレポートでは `conclusion`、無いレポートでは `conclusion-lead`。空なら `none`。
 * `checks` は合図の行（検証結果）。所要時間とお願いへの飛び先は引き当て済み。
 * `status` は包み（`<div class="status">`）の中の合図の行より後ろで、最終でないときは両方 `none`。`finalStatus` は最終レポートのときのもので、段ごとの所要時間と変更したファイル。
 */
export type MainViewSurfaceHead = {
  readonly lead:
    | { readonly kind: "none" }
    | { readonly kind: "conclusion" | "conclusion-lead"; readonly text: string }
  readonly keyFigures: readonly MainViewKeyFigure[]
  /** `Report.workDone`（したこと）の字。省かれていれば空文字。 */
  readonly workDone: string
  /** `Report.notDone`（やっていないこと）。省かれていれば `omitted`、空の並びは `listed` の空。 */
  readonly notDone: ReportNotDoneView
  readonly checks: ReportChecksView
  readonly status: MainViewSurfaceStatus
  readonly finalStatus: MainViewSurfaceStatus
}

/** 包みの中の合図の行より後ろ。段ごとの所要時間と変更したファイルと、検証の控えから運んだ検証の段と件数。 */
export type MainViewSurfaceStatus = {
  readonly phaseTimes: PhaseTimesView
  readonly changedFiles: ChangedFilesView
  readonly verification: ReportVerification
  readonly map?: ReportMap
}

export type MainViewKeyFigure = Extract<LeafComponent, { readonly kind: "stats" }>["items"][number]

/**
 * 図か振り返りの欄1つを、`DrawnSection` の塊の並びのまま持つ。
 * `regionId` は節の欄の ID（図は先頭の 0）。`heading` は見出しの行（`## …`。見出しの無い欄は空文字）、`headingText` は見出しの字。
 * `entries` は描く塊を順に並べたもの。内容部品に由来する塊は部品の ID（描くのは面の内容部品の実装）、由来しない塊（振り返りの要約とドラフトの行）は Markdown。
 */
export type MainViewSurfaceLeafRegion =
  | { readonly kind: "none" }
  | {
      readonly kind: "leaves"
      readonly regionId: number
      readonly heading: string
      readonly headingText: string
      readonly entries: readonly MainViewSurfaceEntry[]
    }

export type MainViewSurfaceEntry =
  | { readonly kind: "leaf"; readonly id: string }
  | { readonly kind: "text"; readonly markdown: string }
