// 見本帳の「画面の部品」のうち、メインビューの小さな部品（いまのフェーズ・補足・済んだフェーズ・進み具合・やり取りの列）の例。

import { createRef } from "react"

import type { PhaseRow } from "../../page/conversation/components/main-view/domain/phase-row.ts"
import type {
  WorkStripPhase,
  WorkStripModel,
} from "../../page/conversation/components/main-view/hooks/use-work-strip.ts"
import { PresentationalAsideThread } from "../../page/conversation/components/main-view/presentational-aside-thread.tsx"
import { PresentationalCurrentStep } from "../../page/conversation/components/main-view/presentational-current-step.tsx"
import { PresentationalPhaseList } from "../../page/conversation/components/main-view/presentational-phase-list.tsx"
import { PresentationalReportOutline } from "../../page/conversation/components/main-view/presentational-report-outline.tsx"
import { PresentationalWorkStrip } from "../../page/conversation/components/main-view/presentational-work-strip.tsx"
import type { ScreenPartExample } from "./screen-part-example-type.ts"

const noop = (): void => {}

function phaseRow(number: number, title: string, duration: string, skipped: boolean): PhaseRow {
  return {
    stepId: number,
    number,
    title,
    duration,
    skipped,
    mark: skipped ? "–" : "✓",
    body: {
      kind: "text",
      report: {
        kind: "markdown",
        markdown: `${title}のまとめです。\n\n- 確かめたこと\n- 次にすること`,
      },
      firstLine: title,
      task: { kind: "none" },
      finishedPhase: { kind: "none" },
      changeSummary: { kind: "none" },
    },
  }
}

const PHASE_ROWS = [
  phaseRow(1, "下調べ", "2:16", false),
  phaseRow(2, "実装", "5:40", false),
  phaseRow(3, "飛ばした確認", "", true),
]

function stripPhase(
  key: string,
  mark: string,
  label: string,
  state: WorkStripPhase["state"],
): WorkStripPhase {
  return {
    key,
    mark,
    label,
    state,
    skipped: false,
    spinning: state === "current",
    popoverId: `popover-${key}`,
    popover: { kind: "closed" },
    onToggle: noop,
  }
}

const STRIP_BASE = {
  trackRef: createRef<HTMLOListElement>(),
  readingLabel: "",
  sideLabel: "経過 6分12秒",
  steps: {
    toggleLabel: "手順 12 ▾",
    list: { kind: "closed" },
    onToggle: noop,
    groups: [],
    backgroundList: { kind: "none" },
  },
} as const

const WORKING_STRIP: WorkStripModel = {
  ...STRIP_BASE,
  kind: "working",
  result: "working",
  phases: [
    {
      kind: "phase",
      spanHead: { kind: "none" },
      phase: stripPhase("p1", "✓", "1. 下調べ（済）", "done"),
    },
    {
      kind: "phase",
      spanHead: { kind: "none" },
      phase: stripPhase("p2", "2", "2. 実装（今のフェーズ）", "current"),
    },
    {
      kind: "phase",
      spanHead: { kind: "none" },
      phase: stripPhase("p3", "3", "3. 確認", "upcoming"),
    },
  ],
  headLabel: "実装",
  activity: { text: "ファイルを読んでいる", tone: "quiet", mono: false, retry: { kind: "none" } },
}

const FINISHED_STRIP: WorkStripModel = {
  ...STRIP_BASE,
  kind: "finished",
  result: "done",
  phases: [
    {
      kind: "phase",
      spanHead: { kind: "none" },
      phase: stripPhase("p1", "✓", "1. 下調べ（済）", "done"),
    },
    {
      kind: "phase",
      spanHead: { kind: "none" },
      phase: stripPhase("p2", "✓", "2. 実装（済）", "done"),
    },
  ],
  headLabel: "全部のフェーズが済んだ",
  sideLabel: "所要 21分49秒",
}

const OUTLINE_BASE = {
  visible: true,
  onSelectTurn: noop,
  onNotice: noop,
  onSelectReport: noop,
  frameRef: createRef<HTMLDivElement>(),
  contentRef: createRef<HTMLDivElement>(),
  navRef: createRef<HTMLElement>(),
  listRef: createRef<HTMLDivElement>(),
  onNavKeyDown: noop,
  onSelect: noop,
  collapsed: false,
  onToggleCollapse: noop,
  widthStyle: {},
  onWidthChange: noop,
  onWidthCommit: noop,
} as const

export const MAIN_VIEW_EXAMPLES: readonly ScreenPartExample[] = [
  {
    frame: "flow",
    path: "page/conversation/components/main-view/presentational-current-step.tsx",
    render: () => (
      <>
        <PresentationalCurrentStep
          step={{
            kind: "shown",
            heading: "いまのフェーズ · 3 題",
            activity: {
              text: "ファイルを読んでいる",
              tone: "quiet",
              mono: false,
              retry: { kind: "none" },
            },
          }}
        />
        <PresentationalCurrentStep
          step={{
            kind: "shown",
            heading: "いまのフェーズ",
            activity: {
              text: "Bash ls -la",
              tone: "asking",
              mono: true,
              retry: { kind: "retrying", label: "再試行 2/10", detail: "混み合っています" },
            },
          }}
        />
      </>
    ),
  },
  {
    frame: "flow",
    path: "page/conversation/components/main-view/presentational-aside-thread.tsx",
    render: () => (
      <PresentationalAsideThread
        summary="補足メッセージ 2件"
        open
        onToggle={noop}
        rows={[
          { key: "r1", text: "ついでに表も足して", answer: "足しておきました" },
          { key: "r2", text: "色は控えめに", answer: "…" },
        ]}
      />
    ),
  },
  {
    frame: "flow",
    path: "page/conversation/components/main-view/presentational-phase-list.tsx",
    render: () => (
      <>
        <PresentationalPhaseList
          turnId={1}
          list={{ rows: PHASE_ROWS, sheet: { kind: "closed" }, onOpen: noop, onClose: noop }}
        />
      </>
    ),
  },
  {
    frame: "flow",
    path: "page/conversation/components/main-view/presentational-work-strip.tsx",
    render: () => (
      <>
        <PresentationalWorkStrip strip={WORKING_STRIP} />
        <PresentationalWorkStrip strip={FINISHED_STRIP} />
      </>
    ),
  },
  {
    frame: "flow",
    path: "page/conversation/components/main-view/presentational-report-outline.tsx",
    render: () => (
      <PresentationalReportOutline
        {...OUTLINE_BASE}
        turnRows={[
          {
            id: 1,
            title: "READMEの見直し",
            result: "done",
            asideCount: 0,
            headedSectionIds: [],
            report: { kind: "report", label: "final", title: "READMEの見直し" },
            isActive: false,
          },
          {
            id: 2,
            title: "表の追加",
            result: "working",
            asideCount: 1,
            headedSectionIds: [1, 2],
            report: { kind: "report", label: "interim", title: "表の追加" },
            isActive: true,
          },
        ]}
        notice={{ kind: "none" }}
        reportRow={{ kind: "shown", label: "interim", title: "表の追加", isActive: true }}
        rows={[
          { level: "section", text: "背景", isActive: true, inActiveSection: true },
          { level: "sub", text: "これまでの経緯", isActive: false, inActiveSection: true },
          { level: "section", text: "次にすること", isActive: false, inActiveSection: false },
        ]}
      >
        <p>本文の置き場です。</p>
      </PresentationalReportOutline>
    ),
  },
]
