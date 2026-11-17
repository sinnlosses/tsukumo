// いまの様子の、駆動の外の材料を読む口の配線。
// 今日終えた数は成果の読みを短く切って借り、先頭の札は見張りが最後に届けた一覧から引く。フックから問い合わせは起こさない。

import { localCalendarAt } from "../server/adapter/local-time.ts"
import type { PresentSceneSource } from "../server/session-driver/core/present-scene-keeper.ts"
import {
  type DoneTodayRead,
  type NextTask,
  restoredRequestTimes,
} from "../server/session-driver/core/present-scene.ts"
import type { RestoredEvent, SessionEvent } from "../shared/session/session-event.ts"

/** 今日終えた数の読みを待つ上限。超えたら `unknown` に倒す（依頼をモデルへ渡すのを待たせない）。 */
const DONE_TODAY_READ_LIMIT_MS = 300

export function wirePresentScene(ports: {
  readonly doneToday: () => Promise<DoneTodayRead>
  readonly nextTask: () => NextTask
  /** `ms` ミリ秒たったら解ける約束。 */
  readonly wait: (ms: number) => Promise<void>
}): {
  /** 起こす代の組み直した履歴から、その代の口を作る。 */
  readonly sourceOf: (restored: Promise<readonly RestoredEvent[]>) => PresentSceneSource
  /**
   * 代の出来事を観る。ターンが終わるたびに今日終えた数を裏で1回読んでおく
   * （成果の読みは印が変わった直後の1回だけ前の結果を返すので、次の入力で読み直した数が返る）。
   */
  readonly observe: (event: SessionEvent) => void
} {
  const readDoneToday = (): Promise<DoneTodayRead> =>
    Promise.race([
      ports.doneToday(),
      ports.wait(DONE_TODAY_READ_LIMIT_MS).then((): DoneTodayRead => ({ kind: "unknown" })),
    ])
  return {
    sourceOf: (restored) => ({
      localHourAt: (at) => localCalendarAt(at).hour,
      earlierRequestTimes: async () => restoredRequestTimes(await restored),
      doneToday: readDoneToday,
      nextTask: ports.nextTask,
    }),
    observe: (event) => {
      if (event.kind === "turn-finished") {
        void ports.doneToday()
      }
    },
  }
}
