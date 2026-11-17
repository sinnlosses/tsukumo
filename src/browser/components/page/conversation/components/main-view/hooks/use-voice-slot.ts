// 声の定位置に出す1件。いま出している反応から導く。
// 待ちの一言は時刻が来た瞬間に何のイベントも来ないので、出し始める時刻に1回だけ描き直す。

import { useState } from "react"

import { useExternalSync } from "../../../../../../hooks/use-external-sync.ts"
import { nowEpochMilliseconds } from "../../../../../../utils/clock.ts"
import { welcomeHeadOf } from "../../../domain/welcome-entry-list.ts"
import { useShownReaction, useWaitingLineDueAt } from "../../../stores/shown-reaction.ts"
import { useWelcomeCards } from "../../hooks/use-welcome-card-list.ts"
import { voiceSlotOf, type VoiceSlot } from "../domain/voice-slot.ts"

export function useVoiceSlot(): VoiceSlot {
  const [now, setNow] = useState(() => nowEpochMilliseconds())
  const dueAt = useWaitingLineDueAt()
  const { cards } = useWelcomeCards()
  useExternalSync(() => {
    const at = nowEpochMilliseconds()
    setNow(at)
    if (dueAt === undefined || dueAt <= at) {
      return undefined
    }
    const timer = setTimeout(() => {
      setNow(nowEpochMilliseconds())
    }, dueAt - at)
    return () => {
      clearTimeout(timer)
    }
  }, [dueAt])
  return voiceSlotOf(useShownReaction(welcomeHeadOf(cards), now))
}
