// 見本帳の「画面の部品」のうち、画面のナビの帯とサイドバーの下端の帯の例。
// 顔は data: の SVG を FACE.url に入れてキャラクターの選び手に渡す。帯の中の「いまの作業」と動き方の操作子は、store の既定の値で描く。

import { createRef } from "react"

import { parseSessionId } from "../../../../shared/session/session-id.ts"
import type { CurrentWork } from "../../../features/current-work/hooks/use-current-work.ts"
import type { ModelPermissionControl } from "../../../stores/model-permission.ts"
import type {
  ScreenNavGate,
  ScreenNavParts,
  ScreenNavView,
} from "../../domain/screen-nav/hooks/use-screen-nav.ts"
import { PresentationalScreenNav } from "../../domain/screen-nav/presentational-screen-nav.tsx"
import { PresentationalSidebarFooter } from "../../domain/sidebar/components/presentational-sidebar-footer.tsx"
import type { SidebarFooterView } from "../../domain/sidebar/hooks/use-sidebar-footer.ts"
import type { ScreenPartExample } from "./screen-part-example-type.ts"

const noop = (): void => {}

// 帯の `data-screen="conversation"` は body ごと縦に固定する組み方へ切り替えるので、見本帳（縦に流れる1枚）では会話以外の画面を名乗らせる。

const FACE_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#c98"/><circle cx="32" cy="32" r="18" fill="#fff"/></svg>',
  )

const FACE = { url: FACE_IMAGE, alt: "さくら" }

const SAMPLE_SESSION_ID = parseSessionId("00000000-0000")

function gate(
  label: string,
  icon: ScreenNavGate["icon"],
  screen: ScreenNavGate["screen"],
  active: boolean,
): ScreenNavGate {
  return {
    screen,
    label,
    icon,
    href: "#design",
    active,
    returnMark: false,
    disabled: false,
    title: undefined,
    onGo: noop,
  }
}

const WORK: CurrentWork = {
  state: "running",
  wordLabel: "作業中",
  mark: "●",
  chatIdle: false,
  pendingHint: { kind: "none" },
  phase: { kind: "shown", label: "2/4 実装" },
  summary: { kind: "text", label: "READMEを編集している" },
  runningStep: { kind: "none" },
  backgroundList: { kind: "none" },
  plan: { kind: "none" },
  stepList: { kind: "no-request" },
  open: false,
  onToggle: noop,
  onClose: noop,
  toggleRef: noop,
}

const MODEL_PERMISSION: ModelPermissionControl = {
  model: "sonnet",
  modelDot: "none",
  effortDot: "none",
  permissionModeDot: "none",
  onSetModel: noop,
  effort: { kind: "known", value: "medium", options: ["low", "medium", "high"] },
  modelEffortSupport: [],
  onSetEffort: noop,
  permissionMode: "default",
  permissionModeDangerous: false,
  onSetPermissionMode: noop,
}

const PARTS: ScreenNavParts = {
  character: {
    face: FACE,
    label: "キャラクターを選ぶ（いまは さくら）",
    open: false,
    options: [{ name: "sakura", label: "さくら", face: FACE, inUse: true }],
    blocked: false,
    blockedTitle: undefined,
    onToggle: noop,
    close: noop,
    onPick: noop,
    toggleRef: noop,
  },
  sessionTag: {
    title: { kind: "project", project: "sample-project", room: "仕事部屋" },
    identity:
      SAMPLE_SESSION_ID === undefined
        ? { kind: "unknown" }
        : {
            kind: "known",
            sessionId: SAMPLE_SESSION_ID,
            shortId: "0000",
            startedLabel: "1/1 10:00〜",
          },
    open: false,
    onOpen: noop,
  },
  gates: [
    gate("仕事", "work", "conversation", false),
    gate("雑談", "chat", "conversation", false),
    gate("キャラクター", "character", "character", false),
    gate("トークン消費", "token", "token-usage", false),
    gate("実績", "achievement", "achievement", true),
  ],
  modelPermission: MODEL_PERMISSION,
  work: WORK,
  settings: {
    open: false,
    onOpen: noop,
    onClose: noop,
    colors: [{ key: "ground", label: "地の色", value: "#f7f4ee", onChange: noop }],
    colorNotice: { kind: "none" },
    sessionDefault: {
      model: "sonnet",
      onChangeModel: noop,
      effort: { kind: "known", value: "medium", options: ["low", "medium", "high"] },
      modelEffortSupport: [],
      onChangeEffort: noop,
      permissionMode: "default",
      onChangePermissionMode: noop,
      figurePreference: "chart",
      onChangeFigurePreference: noop,
    },
    revealSpeed: { value: "standard", onChange: noop },
    launchSkill: { value: "", onChange: noop },
    resetDisabled: true,
    onReset: noop,
    toggleRef: createRef(),
  },
  onSelect: noop,
}

const NAV: ScreenNavView = {
  current: "achievement",
  parts: PARTS,
  switcher: {
    open: false,
    onClose: noop,
    rows: [],
    blocked: false,
    blockedTitle: undefined,
    onSwitch: noop,
    onStartNew: noop,
  },
  drawer: {
    open: false,
    toggleRef: createRef(),
    onOpen: noop,
    onClose: noop,
    tabs: [
      { tab: "turns", label: "やり取り", selected: true },
      { tab: "tasks", label: "タスク", selected: false },
      { tab: "usage", label: "使用量", selected: false },
    ],
    tab: "turns",
    onSelectTab: noop,
    newSession: { disabled: false, title: undefined, onStart: noop },
    face: "tabs",
    onShowSettings: noop,
    onShowTabs: noop,
    screenGates: [],
  },
  headSource: undefined,
  ref: createRef(),
}

const FOOTER: SidebarFooterView = {
  ref: createRef(),
  open: false,
  detailId: "design-sidebar-footer-detail",
  onToggle: noop,
  contextUsage: { kind: "pending" },
  planUsage: { state: { kind: "pending" }, source: { kind: "none" }, fetching: false, retry: noop },
  contextGauge: {
    label: "文脈",
    percentageText: "7%",
    fillWidth: 7,
    compact: { kind: "at", position: 80 },
    warn: false,
    busy: false,
    source: { kind: "after", finishedTurnCount: 3 },
  },
  planGauge: {
    label: "プラン使用量",
    busy: false,
    source: { kind: "after", finishedTurnCount: 3 },
    fiveHour: { label: "5時間", percentageText: "24%", slice: { kind: "none" }, warn: false },
    sevenDay: { label: "7日", percentageText: "61%", slice: { kind: "none" }, warn: true },
  },
}

export const NAV_EXAMPLES: readonly ScreenPartExample[] = [
  {
    frame: "bar",
    path: "domain/screen-nav/presentational-screen-nav.tsx",
    render: () => (
      <PresentationalScreenNav
        {...NAV}
        slots={{ runSetting: undefined, turns: undefined, tasks: undefined, usage: undefined }}
      />
    ),
  },
  {
    frame: "popup",
    path: "domain/sidebar/components/presentational-sidebar-footer.tsx",
    render: () => (
      <>
        <PresentationalSidebarFooter {...FOOTER} />
        <PresentationalSidebarFooter {...FOOTER} open />
      </>
    ),
  },
]
