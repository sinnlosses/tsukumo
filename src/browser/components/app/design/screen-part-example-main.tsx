// 見本帳の「画面の部品」のうち、メインビューの小さな部品（いまのフェーズ・補足・済んだフェーズ・進み具合・やり取りの列）の例。

import { createRef } from "react"

import { parseSessionId } from "../../../../shared/session/session-id.ts"
import type { PhaseRow } from "../../page/conversation/components/main-view/domain/phase-row.ts"
import type { StepsPhaseRow } from "../../page/conversation/components/main-view/domain/steps-phase-row.ts"
import type { SessionDetailPop } from "../../page/conversation/components/main-view/hooks/use-session-detail-pop.ts"
import type { WorkStripPhaseDetail } from "../../page/conversation/components/main-view/hooks/use-work-strip-phase-detail.ts"
import type {
  WorkStripSegmentsModel,
  WorkStripSegmentView,
} from "../../page/conversation/components/main-view/hooks/use-work-strip-segment-list.ts"
import type { WorkStripStepsPop } from "../../page/conversation/components/main-view/hooks/use-work-strip-steps-pop.ts"
import type { WorkStripModel } from "../../page/conversation/components/main-view/hooks/use-work-strip.ts"
import { PresentationalCurrentStep } from "../../page/conversation/components/main-view/presentational-current-step.tsx"
import { PresentationalPhaseDetail } from "../../page/conversation/components/main-view/presentational-phase-detail.tsx"
import { PresentationalPhaseList } from "../../page/conversation/components/main-view/presentational-phase-list.tsx"
import { PresentationalReportOutline } from "../../page/conversation/components/main-view/presentational-report-outline.tsx"
import { PresentationalSessionDetailPanel } from "../../page/conversation/components/main-view/presentational-session-detail-panel.tsx"
import { PresentationalSessionOutline } from "../../page/conversation/components/main-view/presentational-session-outline.tsx"
import { PresentationalStepsList } from "../../page/conversation/components/main-view/presentational-steps-list.tsx"
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

function segmentOf(
  key: string,
  label: string,
  state: WorkStripSegmentView["state"],
): WorkStripSegmentView {
  return {
    key,
    state,
    label,
    phases: [],
    spanName: "",
    parallelLabel: "",
    unseen: false,
    landing: false,
  }
}

const CLOSED_PHASE_DETAIL: WorkStripPhaseDetail = {
  anchorRef: createRef<HTMLElement>(),
  onSegmentPress: noop,
  popup: { kind: "closed" },
  place: { left: 0, top: 0, width: 0 },
  onClose: noop,
}

const STEPS_POP: WorkStripStepsPop = {
  toggleRef: createRef<HTMLButtonElement>(),
  place: { left: 0, top: 0, width: 0 },
  onClose: noop,
}

const SESSION_DETAIL_POP: SessionDetailPop = {
  anchorRef: createRef<HTMLButtonElement>(),
  listRef: createRef<HTMLDivElement>(),
  place: { left: 0, top: 0, width: 0, maxHeight: 0 },
  shouldClose: () => true,
  focusDetail: noop,
}

const WORKING_TRACK: WorkStripSegmentsModel = {
  kind: "shown",
  position: { kind: "shown", text: "2/3" },
  onLanded: noop,
  segments: [
    segmentOf("s1", "フェーズ 1/3 下調べ（済み）", "done"),
    segmentOf("s2", "フェーズ 2/3 実装（いま）", "current"),
    segmentOf("s3", "フェーズ 3/3 確認（これから）", "upcoming"),
  ],
}

const FINISHED_TRACK: WorkStripSegmentsModel = {
  kind: "shown",
  position: { kind: "none" },
  onLanded: noop,
  segments: [
    segmentOf("s1", "フェーズ 1/2 下調べ（済み）", "done"),
    segmentOf("s2", "フェーズ 2/2 実装（済み）", "done"),
  ],
}

const STRIP_BASE = {
  readingLabel: "",
  steps: {
    list: { kind: "closed" },
    toggleLabel: "手順 12件",
    hasFailedAgent: false,
    onToggle: noop,
    onExpandDone: noop,
    onExpandSteps: noop,
    workflows: [],
    onUnfoldPhases: noop,
    onFoldPhases: noop,
    onUnfoldColumn: noop,
    onOpenRun: noop,
    onAgentPress: noop,
    onPreludePress: noop,
    phaseCountLabel: "",
    card: [],
    rest: [],
    phaseTimes: { kind: "none" },
    backgroundList: { kind: "none" },
    elapsedLabel: "経過 6分12秒",
    estimate: { kind: "none" },
  },
  estimate: { kind: "none" },
} as const

const STEPS_ROW_BASE = {
  skipped: false,
  spanName: "",
  parallelLabel: "",
  duration: "",
  measured: { kind: "unknown" },
  summary: "",
  groups: [],
  stepCount: 0,
} as const satisfies Partial<StepsPhaseRow>

const WORKING_STRIP: WorkStripModel = {
  ...STRIP_BASE,
  kind: "working",
  result: "working",
  mark: "dot",
  headLabel: "実装",
  statement: "",
  estimate: { kind: "shown", low: 3, high: 5 },
}

const FINISHED_STRIP: WorkStripModel = {
  ...STRIP_BASE,
  kind: "finished",
  result: "done",
  mark: "check",
  headLabel: "できました",
  statement: "",
}

const SAMPLE_SESSION_ID = parseSessionId("00000000-0000")

const OUTLINE_BASE = {
  visible: true,
  onSelectTurn: noop,
  onSelectReport: noop,
  contentRef: createRef<HTMLDivElement>(),
  navRef: createRef<HTMLElement>(),
  listRef: createRef<HTMLDivElement>(),
  onNavKeyDown: noop,
  onSelect: noop,
  collapsed: false,
  onToggleCollapse: noop,
  side: "turns",
  onSelectSide: noop,
  sessionCount: 3,
  sessionBody: undefined,
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
        <PresentationalWorkStrip
          strip={WORKING_STRIP}
          now={{ kind: "none" }}
          track={WORKING_TRACK}
          phaseDetail={CLOSED_PHASE_DETAIL}
          stepsPop={STEPS_POP}
        />
        <PresentationalWorkStrip
          strip={FINISHED_STRIP}
          now={{ kind: "none" }}
          track={FINISHED_TRACK}
          phaseDetail={CLOSED_PHASE_DETAIL}
          stepsPop={STEPS_POP}
        />
      </>
    ),
  },
  {
    frame: "flow",
    path: "page/conversation/components/main-view/presentational-steps-list.tsx",
    render: () => (
      <PresentationalStepsList
        id="steps-example"
        landing={{ kind: "top" }}
        steps={{
          ...STRIP_BASE.steps,
          phaseCountLabel: "2 フェーズ",
          card: [
            {
              kind: "phase",
              hiddenStepCount: 0,
              open: false,
              groups: [],
              row: {
                ...STEPS_ROW_BASE,
                key: "phase-0",
                phaseIndex: 0,
                name: "調べる",
                mark: "✓",
                state: "done",
                duration: "48秒",
                summary: "構成を読み、変える箇所を決めた。",
              },
            },
            {
              kind: "phase",
              hiddenStepCount: 0,
              open: false,
              groups: [],
              row: {
                ...STEPS_ROW_BASE,
                key: "phase-1",
                phaseIndex: 1,
                name: "実装",
                mark: "2",
                state: "current",
              },
            },
          ],
        }}
      />
    ),
  },
  {
    frame: "popup",
    path: "page/conversation/components/main-view/presentational-phase-detail.tsx",
    render: () => (
      <PresentationalPhaseDetail
        detail={{
          state: "done",
          name: "下調べ",
          meta: "1/3 · 済み · 48秒",
          number: "",
          summary: "関連する部品と呼び出しの流れを読み、直す箇所を絞った。",
          groups: [],
          note: "",
        }}
      />
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
        reportRow={{ kind: "shown", label: "interim", title: "表の追加", isActive: true }}
        rows={[
          { level: "section", text: "背景", isActive: true, inActiveSection: true },
          { level: "sub", text: "これまでの経緯", isActive: false, inActiveSection: true },
          { level: "section", text: "次にすること", isActive: false, inActiveSection: false },
        ]}
      />
    ),
  },
  {
    frame: "flow",
    path: "page/conversation/components/main-view/presentational-session-outline.tsx",
    render: () => (
      <PresentationalSessionOutline
        side="sessions"
        onSelectSide={noop}
        count={3}
        selectedKey="b"
        onSelectRow={noop}
        onMove={noop}
        pop={SESSION_DETAIL_POP}
        onOpenSwitcher={noop}
        sections={[
          {
            group: "today",
            rows: [
              {
                key: "a",
                sessionId: SAMPLE_SESSION_ID,
                heading: "READMEの見直し",
                timeLabel: "いま",
                current: true,
                occupiedElsewhere: false,
              },
              {
                key: "b",
                sessionId: SAMPLE_SESSION_ID,
                heading: "表の追加",
                timeLabel: "21:10",
                current: false,
                occupiedElsewhere: false,
              },
            ],
          },
          {
            group: "yesterday",
            rows: [
              {
                key: "c",
                sessionId: SAMPLE_SESSION_ID,
                heading: "立ち絵の縁を整える",
                timeLabel: "19:42",
                current: false,
                occupiedElsewhere: true,
              },
            ],
          },
        ]}
      />
    ),
  },
  {
    frame: "flow",
    path: "page/conversation/components/main-view/presentational-session-detail-panel.tsx",
    render: () => (
      <PresentationalSessionDetailPanel
        pop={SESSION_DETAIL_POP}
        detail={
          SAMPLE_SESSION_ID === undefined
            ? undefined
            : {
                row: {
                  sessionId: SAMPLE_SESSION_ID,
                  shortId: "B2",
                  heading: "READMEの見直し",
                  group: "today",
                  timeLabel: "21:10",
                  rangeLabel: "11/24 20:31 – 21:10",
                  current: false,
                  worktree: "sample-tree",
                  inCurrentWorktree: true,
                  occupiedElsewhere: false,
                },
                digest: { kind: "unavailable" },
                characterName: "サンプル",
                blocked: false,
                onSwitch: noop,
                onClose: noop,
              }
        }
      />
    ),
  },
]
