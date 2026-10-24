// 状態のカタログのうち、帯の「いまの作業」・ワークプラン・委譲中の帯の場面。

import { WORK_PLAN_FINAL_SELECTOR, WORK_TOGGLE_SELECTOR } from "./catalog-selector.ts"
import { SCENE_END_SETTLE, type CatalogEntry } from "./catalog-type.ts"

export const WORK_PLAN_ENTRIES: readonly CatalogEntry[] = [
  // 帯の「いまの作業」の3状態（`docs/architecture/testing.md`「手で確かめること」）。どれも
  // `WORK_TOGGLE_SELECTOR` を押して一覧を開く。
  {
    name: "current-work-running",
    // 自分の `request` を持つ場面（`fixture/fake-session/`）なので、名指しで
    // 直接起こしてもターンが進行中のまま20秒続く——その間に撮れば「作業中」と実行中の手順が出る。
    scene: "current-work-running",
    label: "帯の「いまの作業」（実行中）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "click", selector: WORK_TOGGLE_SELECTOR }],
    skipReveal: false,
    settle: { kind: "scene-event", eventKind: "tool-started", occurrence: 1 },
  },
  {
    name: "current-work-failed",
    // 自分の `request` を持つ場面（`current-work-running` と同じ理由）。`report` 場面には
    // 失敗した手順があっても `request` が無いので「依頼の手順」に一度も現れない
    // （`currentTurnSteps` は最後の `request` より前の手順を
    // 落とす）。ターンが終わったあとでも「前の依頼での手順」に失敗した1件（`isError: true` の
    // Bash）が残る。
    scene: "current-work-failed",
    label: "帯の「いまの作業」（失敗した手順）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "click", selector: WORK_TOGGLE_SELECTOR }],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "current-work-background",
    scene: "background-task",
    label: "帯の「いまの作業」（バックグラウンドタスク）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "click", selector: WORK_TOGGLE_SELECTOR }],
    skipReveal: false,
    settle: { kind: "scene-event", eventKind: "turn-finished", occurrence: 1 },
  },
  {
    name: "work-plan-running",
    // 段の2つ目で長い Bash が約7秒走るあいだに、札の段と一覧の頭のワークプランを撮る。
    scene: "work-plan",
    label: "いまの作業のワークプラン（作業中）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "click", selector: WORK_TOGGLE_SELECTOR }],
    skipReveal: false,
    settle: { kind: "scene-event", eventKind: "tool-started", occurrence: 4 },
  },
  {
    name: "work-plan-delegated-trail",
    // 範囲の後ろの段が今の場面で、一覧の頭のワークプランが前・本・後の群ごとの行になるのを撮る。
    // 「いまの作業」の札は会話の画面には出ないので、キャラの画面へ移ってから押す。
    scene: "delegated-range-trail",
    label: "いまの作業のワークプラン（前・本・後の群）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [
      { kind: "hash", hash: "#character" },
      { kind: "click", selector: WORK_TOGGLE_SELECTOR },
    ],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "work-plan-main-view",
    // 最終 `report` は約10秒後に届き、中間レポートの並びの最後に最終レポートが出る。
    scene: "work-plan",
    label: "ワークプランが移ったメインビュー（中間レポートと最終レポート）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: true,
    settle: {
      kind: "selector",
      selector: WORK_PLAN_FINAL_SELECTOR,
      phase: "before-prepare",
    },
  },
  {
    name: "work-plan-skipped",
    scene: "work-plan-skipped",
    label: "ワークプランで飛ばした段（帯・中間レポート）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: true,
    settle: {
      kind: "selector",
      selector: WORK_PLAN_FINAL_SELECTOR,
      phase: "before-prepare",
    },
  },
  {
    name: "delegated-range",
    scene: "delegated-range",
    label: "委譲中の帯（範囲の中の段が今）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "delegated-range-outside",
    scene: "delegated-range-outside",
    label: "委譲中の帯（範囲の外の段が今）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "delegated-range-trail",
    scene: "delegated-range-trail",
    label: "委譲中の帯（範囲の後ろの段が今）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
]
