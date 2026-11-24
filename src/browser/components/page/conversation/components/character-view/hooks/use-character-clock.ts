import { useState } from "react"

import {
  nextPortraitMotionTransitionDelayMs,
  type PortraitMotionInput,
} from "../../../../../../domain/portrait-motion.ts"
import { useExternalSync } from "../../../../../../hooks/use-external-sync.ts"
import { nowEpochMilliseconds } from "../../../../../../utils/clock.ts"

/**
 * 立ち絵の動きと待ちの一言が時間だけで変わる瞬間に読み直すための時計。いまの時刻を返す。
 * 祝う・跳ねる・失敗でびくっ・呼ぶ・届いた瞬間の動き・うなずくの期間が過ぎた瞬間と、待ちの一言を出し始める時刻（`waitingDueAt`）にだけ描き直す。
 *
 * 期間と期日は同時に効いていることがある（ツールが失敗した直後にターンが終わる、など）。
 * 次の描き直しまでの遅延はいちばん早いものだけなので、1回だけのタイマーだと、発火して `now` を進めたあとに残りがあっても次のタイマーが立たないまま止まる。
 * `lastToolFailureAt` / `turn` / `waitingDueAt` 自体はその後変わらないので、依存配列では再計算のきっかけにならない。
 * そこで、タイマーが発火するたびに次までの遅延を計算し直して、無くなるまで立て直す。
 *
 * 遅延を計算する前に必ず `now` を進める。
 * 効果が走るまでに時刻をすでに過ぎていると、遅延が負でタイマーが立たず、古い `now` のまま戻らなくなる。
 */
export function useCharacterClock(
  motionInput: Pick<
    PortraitMotionInput,
    | "turn"
    | "lastToolFailureAt"
    | "backgroundRunning"
    | "interrupted"
    | "askedAt"
    | "tab"
    | "sentAt"
    | "arrival"
    | "reducedMotion"
    | "taskFinished"
  >,
  waitingDueAt?: number,
): number {
  const {
    turn,
    lastToolFailureAt,
    backgroundRunning,
    interrupted,
    askedAt,
    tab,
    sentAt,
    arrival,
    reducedMotion,
    taskFinished,
  } = motionInput
  const arrivalAt = arrival?.at
  const arrivalMotion = arrival?.motion
  const [now, setNow] = useState(() => nowEpochMilliseconds())

  useExternalSync(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const scheduleNext = (): void => {
      const at = nowEpochMilliseconds()
      setNow(at)
      const delays = [
        nextPortraitMotionTransitionDelayMs(
          {
            turn,
            lastToolFailureAt,
            backgroundRunning,
            interrupted,
            askedAt,
            tab,
            sentAt,
            arrival:
              arrivalAt === undefined || arrivalMotion === undefined
                ? undefined
                : { at: arrivalAt, motion: arrivalMotion },
            reducedMotion,
            taskFinished,
          },
          at,
        ),
        waitingDueAt === undefined ? undefined : waitingDueAt - at,
      ].filter((ms): ms is number => ms !== undefined && ms > 0)
      if (delays.length === 0) {
        return
      }
      timer = setTimeout(scheduleNext, Math.min(...delays))
    }

    scheduleNext()
    return () => {
      if (timer !== undefined) {
        clearTimeout(timer)
      }
    }
  }, [
    turn,
    lastToolFailureAt,
    backgroundRunning,
    interrupted,
    askedAt,
    tab,
    sentAt,
    arrivalAt,
    arrivalMotion,
    reducedMotion,
    taskFinished,
    waitingDueAt,
  ])

  return now
}
