import { describe, expect, it } from "vitest"

import {
  deliverPresentScene,
  EMPTY_PRESENT_SCENE_MEMORY,
  type PresentSceneDelivery,
  type PresentSceneMemory,
  presentSceneNote,
} from "../../../../src/server/session-driver/core/present-scene-delivery.ts"
import type { PresentScene } from "../../../../src/server/session-driver/core/present-scene.ts"

// 値はすべて架空。

const SCENE: PresentScene = { timeBand: "daytime" }

/** 時刻の帯は渡し済みの覚え。ほかの材料だけを見比べる。 */
const SEEN: PresentSceneMemory = { ...EMPTY_PRESENT_SCENE_MEMORY, timeBand: "daytime" }

/** 覚えから順に場面を渡し、渡したものの並びを返す。 */
function run(
  scenes: readonly PresentScene[],
  memory: PresentSceneMemory = SEEN,
): readonly PresentSceneDelivery[] {
  const deliveries: PresentSceneDelivery[] = []
  let current = memory
  for (const scene of scenes) {
    const decided = deliverPresentScene(current, scene)
    deliveries.push(decided.delivery)
    current = decided.memory
  }
  return deliveries
}

describe("deliverPresentScene", () => {
  it("時刻の帯: 変わったら渡し、同じなら渡さない", () => {
    const [first, same, changed] = run([SCENE, SCENE, { timeBand: "evening" }])
    expect(first?.timeBand).toBe(undefined)
    expect(same?.timeBand).toBe(undefined)
    expect(changed?.timeBand).toBe("evening")
  })

  it("続けて働いた時間: 数が増えたら渡し、同じ数・無いなら渡さない。数え直したあとはまた 2 時間で渡す", () => {
    const worked = (workedHours?: number): PresentScene => ({ ...SCENE, workedHours })
    const delivered = run([worked(2), worked(2), worked(3), worked(), worked(2)]).map(
      (delivery) => delivery.workedHours,
    )
    expect(delivered).toEqual([2, undefined, 3, undefined, 2])
  })

  it("今日終えたタスクの数: 前に見た数より増えたら渡し、同じ・減った・無いなら渡さない。減ったあとの増えは渡す", () => {
    const done = (doneToday?: number): PresentScene => ({ ...SCENE, doneToday })
    const delivered = run([done(2), done(2), done(), done(0), done(1)]).map(
      (delivery) => delivery.doneToday,
    )
    expect(delivered).toEqual([2, undefined, undefined, undefined, 1])
  })

  it("今日終えたタスクの数: 渡さないときも見た数を覚える", () => {
    const done = (doneToday: number): PresentScene => ({ ...SCENE, doneToday })
    const delivered = run([done(0), done(0)]).map((delivery) => delivery.doneToday)
    expect(delivered).toEqual([undefined, undefined])
  })

  it("前の依頼からの経過: まだ渡していない空きなら渡し、渡し済み・無いなら渡さない", () => {
    const away = (requestAt: number): PresentScene => ({
      ...SCENE,
      away: { band: "数日", requestAt },
    })
    const delivered = run([away(10), away(10), SCENE, away(20)]).map((delivery) => delivery.away)
    expect(delivered).toEqual(["数日", undefined, undefined, "数日"])
  })

  it("使用量の帯: 前に渡していない枠が超えたら渡し、増えていない・無いなら渡さない。戻った枠はまた超えたら渡す", () => {
    const usage = (overUsage?: PresentScene["overUsage"]): PresentScene => ({ ...SCENE, overUsage })
    const delivered = run([
      usage(["five-hour"]),
      usage(["five-hour"]),
      usage(),
      usage(["five-hour", "seven-day"]),
      usage(["seven-day"]),
      usage([]),
      usage(["seven-day"]),
    ]).map((delivery) => delivery.overUsage)
    expect(delivered).toEqual([
      ["five-hour"],
      undefined,
      undefined,
      ["five-hour", "seven-day"],
      undefined,
      undefined,
      ["seven-day"],
    ])
  })

  it("次に着手できるタスク: 前に渡した ID と違えば渡し、同じ・無いなら渡さない", () => {
    const next = (nextTaskId?: string): PresentScene => ({ ...SCENE, nextTaskId })
    const delivered = run([next("bd-a1"), next("bd-a1"), next(), next("bd-a2")]).map(
      (delivery) => delivery.nextTaskId,
    )
    expect(delivered).toEqual(["bd-a1", undefined, undefined, "bd-a2"])
  })

  it("空の覚えからは、在る材料を全部渡す", () => {
    const scene: PresentScene = {
      timeBand: "late-night",
      workedHours: 2,
      doneToday: 1,
      away: { band: "1週間以上", requestAt: 5 },
      overUsage: ["seven-day"],
      nextTaskId: "bd-a3",
    }
    expect(deliverPresentScene(EMPTY_PRESENT_SCENE_MEMORY, scene).delivery).toEqual({
      timeBand: "late-night",
      workedHours: 2,
      doneToday: 1,
      away: "1週間以上",
      overUsage: ["seven-day"],
      nextTaskId: "bd-a3",
    })
  })
})

describe("presentSceneNote", () => {
  const ALL: PresentSceneDelivery = {
    timeBand: "late-night",
    workedHours: 3,
    doneToday: 4,
    away: "半日から1日",
    overUsage: ["five-hour", "seven-day"],
    nextTaskId: "bd-a4",
  }

  it("6つを全部渡すと、見出しと6行がこの順に並ぶ", () => {
    expect(presentSceneNote(ALL).split("\n")).toEqual([
      "いまの様子（tsukumo が添える。言うかどうかは任せる）",
      "- 時刻の帯: 夜更け",
      "- 続けて働いた時間: 3時間を超えた",
      "- 今日終えたタスクの数: 4件",
      "- 前の依頼からの経過: 半日から1日",
      "- 使用量の帯: 5時間の枠と7日の枠が8割を超えた",
      "- 次に着手できるタスク: bd-a4",
    ])
  })

  it("渡すものが無ければ空文字列", () => {
    expect(presentSceneNote({})).toBe("")
  })

  it("どの行も、数と決まった語と ID だけの形に当たる", () => {
    const shapes = [
      /^- 時刻の帯: (夜更け|朝|昼|夕|夜)$/,
      /^- 続けて働いた時間: \d+時間を超えた$/,
      /^- 今日終えたタスクの数: \d+件$/,
      /^- 前の依頼からの経過: (半日から1日|数日|1週間以上)$/,
      /^- 使用量の帯: (5時間の枠|7日の枠|5時間の枠と7日の枠)が8割を超えた$/,
      /^- 次に着手できるタスク: [A-Za-z0-9._-]+$/,
    ]
    const lines = presentSceneNote(ALL).split("\n").slice(1)
    expect(lines.every((line, index) => shapes[index]?.test(line) === true)).toBe(true)
  })

  it("空白や改行を含む ID は行にならない", () => {
    expect(presentSceneNote({ nextTaskId: "bd-a5 本文" })).toBe("")
    expect(presentSceneNote({ nextTaskId: "bd-a5\n- 時刻の帯: 夜" })).toBe("")
  })
})
