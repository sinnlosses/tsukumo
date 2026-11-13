// ページが隠れた・戻ったを覚え、戻ったあとの最初の操作までのあいだ、離れていたあいだのまとめを組む。

import type { WorkPlanTrail } from "../../../../../../../shared/session/work-plan-trail.ts"
import type { LatestWorkPlan } from "../../../../../../../shared/session/work-plan.ts"
import { useEventListener } from "../../../../../../hooks/use-event-listener.ts"
import { nowEpochMilliseconds } from "../../../../../../utils/clock.ts"
import { type AwayBrief, awayBriefOf, NO_AWAY_BRIEF } from "../../../domain/away-brief.ts"
import type { WorkPlanAsk } from "../../../domain/work-plan-ask-row.ts"
import type { WorkPlanRow } from "../../../domain/work-plan-row.ts"
import { useAwayReturn } from "../../../stores/away-return.ts"

type AwayBriefInput = {
  readonly plan: LatestWorkPlan
  readonly trail: WorkPlanTrail
  readonly rows: readonly WorkPlanRow[]
  readonly ask: WorkPlanAsk
}

/** 依頼が無いあいだは `trail` を持たないので、`input` を `none` で渡す。 */
export function useAwayBrief(
  input: { readonly kind: "none" } | ({ readonly kind: "turn" } & AwayBriefInput),
): AwayBrief {
  const away = useAwayReturn((state) => state.away)
  const hide = useAwayReturn((state) => state.hide)
  const show = useAwayReturn((state) => state.show)
  const dismiss = useAwayReturn((state) => state.dismiss)

  const onVisibilityChange = (): void => {
    const at = nowEpochMilliseconds()
    if (!document.hidden) {
      show(at)
      return
    }
    const first = input.kind === "turn" ? input.trail.plans[0] : undefined
    if (input.kind !== "turn" || first === undefined) {
      hide(at)
      return
    }
    hide(at, { count: input.trail.plans.length, first })
  }
  useEventListener(document, "visibilitychange", onVisibilityChange)
  useEventListener(window, "click", dismiss, { enabled: away.kind === "returned" })
  useEventListener(window, "keydown", dismiss, { enabled: away.kind === "returned" })

  if (away.kind !== "returned" || away.seen === undefined || input.kind !== "turn") {
    return NO_AWAY_BRIEF
  }
  return awayBriefOf({ awayMs: away.awayMs, seen: away.seen, ...input })
}
