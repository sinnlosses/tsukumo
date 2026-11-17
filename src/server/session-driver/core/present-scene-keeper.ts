// いまの様子の控え役。駆動1代につき1つで、前に渡した値と依頼の時刻と最後の使用量を持つ。
// 起こし直したら代ごと作り直すので全部を忘れる。`/clear` では前に渡した値だけを忘れ、次の入力でいまの材料を渡し直す。

import type { PresentSceneKind } from "../../../shared/diagnostic/present-scene.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { PlanUsage, PlanUsageReport } from "../../../shared/usage/plan-usage.ts"
import {
  deliverPresentScene,
  EMPTY_PRESENT_SCENE_MEMORY,
  type PresentSceneMemory,
  presentSceneKinds,
  presentSceneNote,
} from "./present-scene-delivery.ts"
import { type DoneTodayRead, type NextTask, presentSceneOf } from "./present-scene.ts"

/** 駆動の外にある材料を読む口。どの口も例外を投げない。 */
export type PresentSceneSource = {
  /** その時刻（エポックミリ秒）のローカルの時（0〜23）。 */
  readonly localHourAt: (at: number) => number
  /** 組み直した履歴の依頼の時刻（昇順）。 */
  readonly earlierRequestTimes: () => Promise<readonly number[]>
  readonly doneToday: () => Promise<DoneTodayRead>
  readonly nextTask: () => NextTask
}

export type PresentSceneKeeper = {
  /** 駆動が流すイベントを観る。 */
  readonly observe: (event: SessionEvent) => void
  /** 画面が引いたプラン使用量を覚える。 */
  readonly notePlanUsage: (report: PlanUsageReport) => void
  /** いま渡す文面を取り出す（渡すものが無ければ空文字列）。 */
  readonly take: () => Promise<string>
}

/**
 * 控え役を作る。`take` は口を待ち終えてから、導く・決める・覚えを更新するまでを同期で続ける。
 * 渡したものがあるときだけ、種類の語を `notify` へ知らせる（文面は知らせない）。
 */
export function createPresentSceneKeeper(
  source: PresentSceneSource,
  now: () => number,
  notify: (kinds: readonly PresentSceneKind[]) => void,
): PresentSceneKeeper {
  let memory: PresentSceneMemory = EMPTY_PRESENT_SCENE_MEMORY
  let requestTimes: readonly number[] = []
  let planUsage: { readonly kind: "known"; readonly usage: PlanUsage } | { readonly kind: "none" } =
    {
      kind: "none",
    }

  return {
    observe: (event) => {
      if (event.kind === "request") {
        requestTimes = [...requestTimes, now()]
      }
      if (event.kind === "conversation-cleared") {
        memory = EMPTY_PRESENT_SCENE_MEMORY
      }
    },
    notePlanUsage: (report) => {
      if (report.kind === "ready") {
        planUsage = { kind: "known", usage: report.usage }
      }
    },
    take: async () => {
      const [earlier, done] = await Promise.all([source.earlierRequestTimes(), source.doneToday()])
      const at = now()
      const next = source.nextTask()
      const scene = presentSceneOf({
        now: at,
        hour: source.localHourAt(at),
        requestTimes: [...earlier, ...requestTimes],
        doneToday: done.kind === "known" ? done.count : undefined,
        planUsage: planUsage.kind === "known" ? planUsage.usage : undefined,
        nextTaskId: next.kind === "known" ? next.id : undefined,
      })
      const decided = deliverPresentScene(memory, scene)
      memory = decided.memory
      const kinds = presentSceneKinds(decided.delivery)
      if (kinds.length > 0) {
        notify(kinds)
      }
      return presentSceneNote(decided.delivery)
    },
  }
}
