// いまの様子の、渡す時機と文面を決める。
// 前に渡した値（覚え）といまの値から、変わった材料だけを渡す。文面は数と決まった語と札の ID だけで組む。

import type { PresentSceneKind } from "../../../shared/diagnostic/present-scene.ts"
import type { AwayBand, TimeBand } from "../../core/time-band.ts"
import { isTaskIdWord, type PlanUsageWindowName, type PresentScene } from "./present-scene.ts"

/** 前に渡した値。`doneToday` だけは、渡さなかったときも前に見た数を持つ。 */
export type PresentSceneMemory = {
  readonly timeBand?: TimeBand
  readonly workedHours?: number
  readonly doneToday?: number
  /** 渡した空きの、最後の依頼の時刻。 */
  readonly awayRequestAt?: number
  readonly overUsage: readonly PlanUsageWindowName[]
  readonly nextTaskId?: string
}

/** まだ何も渡していない覚え。 */
export const EMPTY_PRESENT_SCENE_MEMORY = { overUsage: [] } as const satisfies PresentSceneMemory

/** いま渡す材料。`?:` の材料は渡さない。 */
export type PresentSceneDelivery = {
  readonly timeBand?: TimeBand
  readonly workedHours?: number
  readonly doneToday?: number
  readonly away?: AwayBand
  /** いま 8 割を超えている枠の全部。 */
  readonly overUsage?: readonly PlanUsageWindowName[]
  readonly nextTaskId?: string
}

/** 前に渡した値といまの値から、いま渡すものと次に持つ覚えを決める。 */
export function deliverPresentScene(
  memory: PresentSceneMemory,
  scene: PresentScene,
): { readonly delivery: PresentSceneDelivery; readonly memory: PresentSceneMemory } {
  const timeBand = scene.timeBand === memory.timeBand ? undefined : scene.timeBand
  const workedHours =
    scene.workedHours !== undefined && scene.workedHours > (memory.workedHours ?? 0)
      ? scene.workedHours
      : undefined
  const doneToday =
    scene.doneToday !== undefined && scene.doneToday > (memory.doneToday ?? 0)
      ? scene.doneToday
      : undefined
  const away =
    scene.away !== undefined && scene.away.requestAt !== memory.awayRequestAt
      ? scene.away
      : undefined
  const overUsage =
    scene.overUsage !== undefined &&
    scene.overUsage.some((name) => !memory.overUsage.includes(name))
      ? scene.overUsage
      : undefined
  const nextTaskId =
    scene.nextTaskId !== undefined && scene.nextTaskId !== memory.nextTaskId
      ? scene.nextTaskId
      : undefined
  return {
    delivery: { timeBand, workedHours, doneToday, away: away?.band, overUsage, nextTaskId },
    memory: {
      timeBand: scene.timeBand,
      workedHours:
        scene.workedHours === undefined ? undefined : (workedHours ?? memory.workedHours),
      doneToday: scene.doneToday ?? memory.doneToday,
      awayRequestAt: away?.requestAt ?? memory.awayRequestAt,
      overUsage: overUsageMemory(memory.overUsage, scene.overUsage, overUsage !== undefined),
      nextTaskId: nextTaskId ?? memory.nextTaskId,
    },
  }
}

/** 渡す材料の文面。渡すものが無ければ空文字列。 */
export function presentSceneNote(delivery: PresentSceneDelivery): string {
  const lines = presentSceneLines(delivery)
  return lines.length === 0
    ? ""
    : [PRESENT_SCENE_HEADING, ...lines.map(({ line }) => line)].join("\n")
}

/** 渡す材料の種類（文面の行の順）。 */
export function presentSceneKinds(delivery: PresentSceneDelivery): readonly PresentSceneKind[] {
  return presentSceneLines(delivery).map(({ kind }) => kind)
}

const PRESENT_SCENE_HEADING = "いまの様子（tsukumo が添える。言うかどうかは任せる）"

const TIME_BAND_WORDS = {
  "late-night": "夜更け",
  morning: "朝",
  daytime: "昼",
  evening: "夕",
  night: "夜",
} as const satisfies Record<TimeBand, string>

const USAGE_WINDOW_WORDS = {
  "five-hour": "5時間の枠",
  "seven-day": "7日の枠",
} as const satisfies Record<PlanUsageWindowName, string>

/** 渡したら、いま超えている枠。渡さなければ、覚えから 8 割以下に戻った枠を外す。使用量を知らなければ変えない。 */
function overUsageMemory(
  remembered: readonly PlanUsageWindowName[],
  current: PresentScene["overUsage"],
  delivered: boolean,
): readonly PlanUsageWindowName[] {
  if (current === undefined) {
    return remembered
  }
  return delivered ? current : remembered.filter((name) => current.includes(name))
}

type PresentSceneLine = { readonly kind: PresentSceneKind; readonly line: string }

function presentSceneLines(delivery: PresentSceneDelivery): readonly PresentSceneLine[] {
  const { timeBand, workedHours, doneToday, away, overUsage, nextTaskId } = delivery
  const groups: readonly (readonly PresentSceneLine[])[] = [
    timeBand === undefined
      ? []
      : [{ kind: "time-band", line: `- 時間帯: ${TIME_BAND_WORDS[timeBand]}` }],
    workedHours === undefined
      ? []
      : [{ kind: "worked-time", line: `- 続けて働いた時間: ${String(workedHours)}時間を超えた` }],
    doneToday === undefined
      ? []
      : [{ kind: "done-today", line: `- 今日終えたタスクの数: ${String(doneToday)}件` }],
    away === undefined ? [] : [{ kind: "away", line: `- 前の依頼からの経過: ${away}` }],
    overUsage === undefined || overUsage.length === 0
      ? []
      : [
          {
            kind: "plan-usage",
            line: `- 使用量の集計期間: ${overUsage.map((name) => USAGE_WINDOW_WORDS[name]).join("と")}が8割を超えた`,
          },
        ],
    nextTaskId === undefined || !isTaskIdWord(nextTaskId)
      ? []
      : [{ kind: "next-task", line: `- 次に着手できるタスク: ${nextTaskId}` }],
  ]
  return groups.flat()
}
