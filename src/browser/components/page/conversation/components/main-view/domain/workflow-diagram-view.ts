// ワークフローの図を描くための字と座標。頭の件数・箱の読み上げの名前と一言・矢印の端の鍵・測った矩形から組む矢印の線。

import type { WorkflowRun } from "../../../../../../../shared/session/workflow-run.ts"
import type { WorkflowAgentStopReason } from "../../../../../../../shared/session/workflow-step.ts"
import type { MeasuredTime } from "../../../../../../../shared/utils/elapsed-time.ts"
import {
  workflowBoxStateOf,
  type WorkflowDiagramArrow,
  type WorkflowDiagramArrowKind,
  type WorkflowDiagramBox,
  type WorkflowDiagramBoxState,
  type WorkflowDiagramColumn,
  type WorkflowDiagramEnd,
} from "./workflow-diagram.ts"

/** 頭に出す件数1つ。`label` は「動いている 2」。 */
export type WorkflowAgentCount = {
  readonly state: WorkflowDiagramBoxState
  readonly count: number
  readonly label: string
}

/** 図の根の左上からの矩形。 */
export type WorkflowDiagramRect = {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** 矢印1本の線。`labelAt` は差し戻しの字を置く中点で、差し戻しの矢印だけが持つ。 */
export type WorkflowArrowPath = {
  readonly key: string
  readonly d: string
  readonly kind: WorkflowDiagramArrowKind
  readonly labelAt?: { readonly x: number; readonly y: number }
}

const COUNT_ORDER = [
  "running",
  "done",
  "failed",
  "waiting",
  "stopped",
] as const satisfies readonly WorkflowDiagramBoxState[]

const STATE_WORD = {
  running: "動いている",
  waiting: "待ち",
  done: "済み",
  failed: "失敗",
  stopped: "止まった",
} satisfies Record<WorkflowDiagramBoxState, string>

const STOP_REASON_WORD = {
  skipped: "飛ばした",
  blocked: "安全の判定で止まった",
  stalled: "応答が止まった",
  failed: "失敗した",
} satisfies Record<WorkflowAgentStopReason, string>

/** 左右の端の差がこれより小さい2つの矩形は、同じ列に並ぶとみなす。 */
const SAME_COLUMN_TOLERANCE = 4

/** 同じ列の間の箱を避ける線を、列の右の辺から膨らませる幅（px）。列の間の gap に収まる。 */
const DETOUR_WIDTH = 14

/** 矢じりの長さ（px）。図の `<marker>` の寸法と同じにする。線は矢じりの根元で止める。 */
const ARROW_HEAD_LENGTH = 6

/** 線の両端と箱の縁のあいだの隙間（px）。 */
const ARROW_GAP = 2

/** 列をまたぐ曲線の両端に付ける水平の足の最大の長さ（px）。 */
const ARROW_STUB = 8

/** 状態ごとのエージェントの数。0 の状態は出さない。 */
export function workflowAgentCountsOf(run: WorkflowRun): readonly WorkflowAgentCount[] {
  const states = run.agents.map((agent) => workflowBoxStateOf(agent, run.ended))
  return COUNT_ORDER.flatMap((state) => {
    const count = states.filter((candidate) => candidate === state).length
    return count === 0 ? [] : [{ state, count, label: `${STATE_WORD[state]} ${String(count)}` }]
  })
}

/**
 * 見出しに色を付ける列か。依頼が済んでいれば最後の列、ワークプランの今のフェーズ（`planCurrentKey`）が図の列ならその列、
 * どちらでもなければ図が決めた今の列（エージェントの載らない後ろの列は、エージェントの状態からは今の列にならない）。
 */
export function workflowIsCurrentColumn(
  column: WorkflowDiagramColumn,
  columns: readonly WorkflowDiagramColumn[],
  finished: boolean,
  planCurrentKey?: string,
): boolean {
  if (finished) {
    return columns.at(-1) === column
  }
  if (
    planCurrentKey !== undefined &&
    columns.some((other) => columnKeysOf(other).includes(planCurrentKey))
  ) {
    return columnKeysOf(column).includes(planCurrentKey)
  }
  return column.kind === "agents" && column.current
}

/** 列が受け持つ段の鍵。範囲の無い列は自分の鍵だけ。 */
export function columnKeysOf(column: WorkflowDiagramColumn): readonly string[] {
  return column.kind === "agents" ? column.spanKeys : [column.key]
}

/** 範囲の箱の目盛り1つ。`next` はこれから。 */
export type WorkflowSpanTick = {
  readonly key: string
  readonly state: "done" | "now" | "next"
}

/**
 * 範囲の箱（2段以上を受け持つ列の箱）の段ごとの目盛り。範囲が1段なら空。
 * 済んだ箱か依頼が済んでいれば全部済み、走っている箱は `planCurrentKey` の前が済みでその段が「いま」、それ以外は全部これから。
 */
export function workflowSpanScaleOf(
  state: WorkflowDiagramBoxState,
  spanKeys: readonly string[],
  finished: boolean,
  planCurrentKey?: string,
): readonly WorkflowSpanTick[] {
  if (spanKeys.length < 2) {
    return []
  }
  const nowAt = planCurrentKey === undefined ? -1 : spanKeys.indexOf(planCurrentKey)
  return spanKeys.map((key, position): WorkflowSpanTick => {
    if (state === "done" || finished) {
      return { key, state: "done" }
    }
    if (state !== "running" || nowAt < 0 || position > nowAt) {
      return { key, state: "next" }
    }
    return { key, state: position === nowAt ? "now" : "done" }
  })
}

/** エージェントの載らない列の箱の一言。依頼が済めば「済み」、今の列なら「いま」、ほかは「これから」。 */
export function workflowUpcomingNoteOf(finished: boolean, current: boolean): string {
  if (finished) {
    return "済み"
  }
  return current ? "いま" : "これから"
}

/** 矢印の端の鍵。端に当たる要素の `data-diagram-end` と同じ値。 */
export function workflowDiagramEndKeyOf(end: WorkflowDiagramEnd): string {
  switch (end.kind) {
    case "start":
      return "start"
    case "agent":
      return `agent:${String(end.index)}`
    case "others":
      return `others:${end.column}`
    case "folded":
      return "folded"
    case "upcoming":
      return `upcoming:${end.column}`
  }
}

/**
 * 矢印ごとの線。同じ列の2つは上の箱の下端から下の箱の上端へまっすぐ、ほかは右の辺の中ほどから左の辺の中ほどへ曲線で結ぶ。
 * 同じ列の2つの間に別の箱があるときは、その箱を横切らないよう列の右へ膨らませて右の辺どうしを結ぶ。
 * 端の矩形が無い矢印は捨てる。`rects` と `origin` は同じ座標系（ビューポート）の値。
 */
export function workflowArrowPathsOf(
  arrows: readonly WorkflowDiagramArrow[],
  rects: ReadonlyMap<string, WorkflowDiagramRect>,
  origin: { readonly left: number; readonly top: number },
): readonly WorkflowArrowPath[] {
  const all = [...rects.values()]
  return arrows.flatMap((arrow) => {
    const fromKey = workflowDiagramEndKeyOf(arrow.from)
    const toKey = workflowDiagramEndKeyOf(arrow.to)
    const from = rects.get(fromKey)
    const to = rects.get(toKey)
    if (from === undefined || to === undefined) {
      return []
    }
    const blocked = all.some(
      (rect) =>
        sameColumn(rect, from) &&
        rect.top >= from.top + from.height &&
        rect.top + rect.height <= to.top,
    )
    const line = lineOf(shifted(from, origin), shifted(to, origin), blocked)
    return [
      {
        key: `${fromKey}>${toKey}`,
        d: line.d,
        kind: arrow.kind,
        ...(arrow.kind === "sentBack" ? { labelAt: line.middle } : {}),
      },
    ]
  })
}

/** 箱の読み上げの名前「<名札>、<種類の短い名>、<状態>」。種類が無いか名札と同じ語なら種類を抜く。 */
export function workflowBoxLabelOf(box: WorkflowDiagramBox): string {
  const typeName = box.hidesType ? undefined : box.typeName
  return [box.name, ...(typeName === undefined ? [] : [typeName]), STATE_WORD[box.state]].join("、")
}

/** 箱の2行目の一言。走っている・待ちのエージェントは空。 */
export function workflowBoxNoteOf(box: WorkflowDiagramBox): string {
  if (box.sendsBack) {
    return "差し戻し"
  }
  switch (box.state) {
    case "done":
      return `済み · 手順 ${String(box.stepCount ?? 0)}`
    case "failed":
      return STOP_REASON_WORD[box.stopReason ?? "failed"]
    case "stopped":
      return "止まった"
    case "running":
    case "waiting":
      return ""
  }
}

/** ワークフロースクリプト全体の所要（最初に始まったエージェントから、終わっていれば最後に終わったエージェントまで、走っていれば今まで）。始まったエージェントが無ければ `unknown`。 */
export function workflowRunElapsedOf(run: WorkflowRun, now: number): MeasuredTime {
  const starts = run.agents.flatMap((agent) =>
    agent.startedAt === undefined ? [] : [agent.startedAt],
  )
  if (starts.length === 0) {
    return { kind: "unknown" }
  }
  const settled = run.agents.every((agent) => agent.state === "done" || agent.state === "error")
  const ends = run.agents.flatMap((agent) =>
    agent.startedAt === undefined || agent.durationMs === undefined
      ? []
      : [agent.startedAt + agent.durationMs],
  )
  const end = (run.ended || settled) && ends.length > 0 ? Math.max(...ends) : now
  return { kind: "known", milliseconds: Math.max(0, end - Math.min(...starts)) }
}

function shifted(
  rect: WorkflowDiagramRect,
  origin: { readonly left: number; readonly top: number },
): WorkflowDiagramRect {
  return { ...rect, left: rect.left - origin.left, top: rect.top - origin.top }
}

function sameColumn(left: WorkflowDiagramRect, right: WorkflowDiagramRect): boolean {
  return Math.abs(left.left - right.left) < SAME_COLUMN_TOLERANCE
}

function lineOf(
  from: WorkflowDiagramRect,
  to: WorkflowDiagramRect,
  blocked: boolean,
): { readonly d: string; readonly middle: { readonly x: number; readonly y: number } } {
  if (sameColumn(from, to) && blocked) {
    const x = from.left + from.width
    const bulge = x + DETOUR_WIDTH
    const y1 = from.top + from.height / 2
    const y2 = to.top + to.height / 2
    const start = x + ARROW_GAP
    const end = x + ARROW_GAP + ARROW_HEAD_LENGTH
    return {
      d: `M${num(start)} ${num(y1)} C${num(bulge)} ${num(y1)}, ${num(bulge)} ${num(y2)}, ${num(end)} ${num(y2)}`,
      middle: { x: bulge, y: (y1 + y2) / 2 },
    }
  }
  if (sameColumn(from, to)) {
    const x = from.left + from.width / 2
    const y1 = from.top + from.height
    const y2 = to.top
    const start = y1 + ARROW_GAP
    const end = y2 - ARROW_GAP - ARROW_HEAD_LENGTH
    return {
      d: `M${num(x)} ${num(start)} L${num(x)} ${num(end)}`,
      middle: { x, y: (y1 + y2) / 2 },
    }
  }
  const edge1 = from.left + from.width
  const y1 = from.top + from.height / 2
  const edge2 = to.left
  const y2 = to.top + to.height / 2
  const x1 = edge1 + ARROW_GAP
  const x2 = edge2 - ARROW_GAP - ARROW_HEAD_LENGTH
  const stub = Math.min(ARROW_STUB, (x2 - x1) / 4)
  const a1 = x1 + stub
  const a2 = x2 - stub
  const mx = (a1 + a2) / 2
  return {
    d: `M${num(x1)} ${num(y1)} H${num(a1)} C${num(mx)} ${num(y1)}, ${num(mx)} ${num(y2)}, ${num(a2)} ${num(y2)} H${num(x2)}`,
    middle: { x: (edge1 + edge2) / 2, y: (y1 + y2) / 2 },
  }
}

function num(value: number): string {
  return String(Math.round(value * 10) / 10)
}
