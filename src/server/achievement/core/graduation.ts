// 先輩タスクの卒業を、タスクの登録日から決める判断だけを持つ。
// ファイル I/O も `bd` も触らない純関数。
// 数え方の規則の正典は `docs/requirements.md`「成果の振り返り」。
//
// 会話の文面は扱わない。運ぶのはタスクの ID・summary・日付だけ。

import { prop, sortBy } from "remeda"

import type { AchievementGraduation } from "../../../shared/achievement/achievement.ts"
import type { TaskSummaryDiffItem } from "./done-task.ts"

/** 卒業とみなす、登録からの日数の下限（仮）。 */
export const GRADUATION_MIN_DAYS = 7

/**
 * その日に終えたタスクのうち、登録から {@link GRADUATION_MIN_DAYS} 日以上経っていたものを、登録の古い順で返す。
 * 登録日が無いタスクは対象にしない。
 * `registeredOnById` はタスクID → 登録日の日付キー、`endedOn` はその日の日付キー（終えた日）。
 */
export function graduationsOf(
  items: readonly TaskSummaryDiffItem[],
  registeredOnById: ReadonlyMap<string, string>,
  endedOn: string,
): readonly AchievementGraduation[] {
  const endedOnDate = Temporal.PlainDate.from(endedOn)
  const graduations = items.flatMap((item) => {
    const registeredOn = registeredOnById.get(item.id)
    if (registeredOn === undefined) {
      return []
    }
    const days = endedOnDate.since(Temporal.PlainDate.from(registeredOn), {
      largestUnit: "day",
    }).days
    return days >= GRADUATION_MIN_DAYS
      ? [{ id: item.id, summary: item.summary, registeredOn, days }]
      : []
  })
  return sortBy(graduations, prop("registeredOn"))
}
