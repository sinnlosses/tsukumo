// 働くあいだの紙に出す「止まって見える」ときの行（待ち・再試・上限・動かない）と、その行に添える口。
// 「止める」は入力欄の止めるボタンと同じ中断の口を、「依頼を入力欄に戻す」は下書きを入れるだけで送らない。

import { useSession } from "../../../../../../stores/session.ts"
import { useComposerDraft } from "../../../stores/composer-draft.ts"
import { useCurrentTurnSteps } from "../../../stores/current-turn-step-list.ts"
import { useUsualDurations } from "../../../stores/usual-duration.ts"
import { runningStepLineOf, type WorkQuiet, workQuietOf } from "../domain/work-activity.ts"

/** `runningLine` は「出力を見る」で開く、走っている手順の道具と引数の要約（走っていなければ空）。 */
export type WorkQuietLine = {
  readonly quiet: WorkQuiet
  readonly runningLine: string
  readonly onStop: () => void
  readonly onRestoreRequest: () => void
}

/** `now` は紙が数えている時刻（呼び出し側の時計に合わせる）。 */
export function useWorkQuietLine(now: number): WorkQuietLine {
  const turnStepList = useCurrentTurnSteps()
  const dispatch = useSession((session) => session.dispatch)
  const turn = useSession((session) => session.state.turn)
  const asking = useSession((session) => session.state.pending.length > 0)
  const backgroundTasks = useSession((session) => session.state.backgroundTasks)
  const apiTrouble = useSession((session) => session.state.apiTrouble)
  const rateLimit = useSession((session) => session.state.rateLimit)
  const records = useSession((session) => session.state.records)
  const replaceDraft = useComposerDraft((state) => state.replaceDraft)
  const usual = useUsualDurations()
  const steps = turnStepList.kind === "turn" ? turnStepList.steps : []
  return {
    quiet: workQuietOf({
      steps,
      asking,
      backgroundTasks,
      turn,
      apiTrouble,
      rateLimit,
      usual,
      records,
      now,
    }),
    runningLine: runningStepLineOf(steps),
    onStop: () => {
      void dispatch.session.interrupt()
    },
    onRestoreRequest: () => {
      const text = records.findLast((record) => record.kind === "request")?.text ?? ""
      replaceDraft({ text, caret: text.length })
    },
  }
}
