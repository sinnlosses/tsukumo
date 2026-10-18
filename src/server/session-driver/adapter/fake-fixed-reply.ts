// fake driver が claude の代わりに固定で返す値。
// 会話の内容ではないので疑似セッションの JSON には持たせず、ここに直接書く。

import type { EffortLevel } from "../../../shared/command.ts"
import type { ContextUsage } from "../../../shared/context-usage/context-usage.ts"
import type { PlanUsage } from "../../../shared/plan-usage/plan-usage.ts"
import type { ModelEffortSupport } from "../../../shared/session/session-event.ts"

/** fake driver が流す固定のプラン。会話の内容ではないので、疑似セッションの JSON に持たせず、ここに直接書く。 */
export const FAKE_PLAN = "Claude Max"

/**
 * fake driver が起こした直後に1回だけ流す、モデルごとの effort の対応。
 * 会話の内容ではないので疑似セッションの JSON には持たせず、ここに直接書く。
 * 本物の `supportedModels()` の実測値をそのまま写した。
 * `opus` / `sonnet` は5段すべてに対応し、`fable` はエイリアスと違う値〔`claude-fable-5-1`〕で返る。`haiku` は `supportsEffort` 自体が無い。
 * effort に対応しないモデルで選べなくなることと、エイリアスと一致しない値の当て方（画面側の表示ラベルの決め方）の両方を、疑似セッションでも確かめられるようにしてある。
 */
export const FAKE_MODEL_EFFORT_SUPPORT: readonly ModelEffortSupport[] = [
  { model: "opus", supportsEffort: true, effortLevels: ["low", "medium", "high", "xhigh", "max"] },
  {
    model: "claude-fable-5-1",
    supportsEffort: true,
    effortLevels: ["low", "medium", "high", "xhigh", "max"],
  },
  {
    model: "sonnet",
    supportsEffort: true,
    effortLevels: ["low", "medium", "high", "xhigh", "max"],
  },
  { model: "haiku", supportsEffort: false, effortLevels: [] },
]

/** fake driver が起こしたときに効いている既定の effort（疑似セッションだけの値）。 */
export const FAKE_DEFAULT_EFFORT: EffortLevel = "medium"

/**
 * fake driver が返すコンテキストの内訳の数。
 * 会話の内容ではないので疑似セッションの JSON には持たせず、ここに直接書く。
 * 架空の値だが、分類の並びと種別・合計と窓の関係だけは本物に合わせてある。
 * `used` の合計が `totalTokens`、それに `buffer` と `free` を足すと窓の大きさになる。
 */
export const FAKE_CONTEXT_USAGE = {
  totalTokens: 121_500,
  maxTokens: 200_000,
  percentage: 61,
  categories: [
    { name: "System prompt", tokens: 7800, kind: "used" },
    { name: "System tools", tokens: 8700, kind: "used" },
    { name: "MCP tools", tokens: 800, kind: "used" },
    { name: "MCP tools (deferred)", tokens: 2100, kind: "deferred" },
    { name: "Memory files", tokens: 12_200, kind: "used" },
    { name: "Skills", tokens: 4700, kind: "used" },
    { name: "Messages", tokens: 87_300, kind: "used" },
    { name: "Autocompact buffer", tokens: 45_000, kind: "buffer" },
    { name: "Free space", tokens: 33_500, kind: "free" },
  ],
  mcpTools: [
    { name: "mcp__tsukumo__speak", source: "tsukumo", tokens: 180 },
    { name: "mcp__tsukumo__remember", source: "tsukumo", tokens: 120 },
  ],
  memoryFiles: [
    { name: "CLAUDE.md", source: "Project", tokens: 11_400 },
    { name: "MEMORY.md", source: "AutoMem", tokens: 800 },
  ],
  skills: [{ name: "next-task", source: "userSettings", tokens: 120 }],
} satisfies Omit<ContextUsage, "model">

/**
 * fake driver が返すプラン使用量。会話の内容ではないので疑似セッションの JSON には持たせず、ここに直接書く。
 * 架空の値だが、5時間枠・7日間枠の使用率は見本（`QUOTA-Sidebar.dc.html`「1 ふだん」）と同じにしてある。
 * 戻る時刻は固定のエポックミリ秒。
 * 「いま」を読む場所を2つに絞ってある検査に、fake driver がここで触れて増やさないようにする。
 */
export const FAKE_PLAN_USAGE = {
  fiveHour: { utilization: 34, resetsAt: 1_800_010_800_000 },
  sevenDay: { utilization: 61, resetsAt: 1_800_270_000_000 },
} satisfies PlanUsage
