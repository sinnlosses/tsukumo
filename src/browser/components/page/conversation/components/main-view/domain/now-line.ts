// 流れの末尾の「いまの行」を出すかの判定。
// 出すのは、最新のやり取りの中身が働くあいだで、答え待ちでないとき。答え待ちはお伺いのカードが末尾を持つ。

import type { WorkActivity } from "./work-activity.ts"

export type NowLineSource = {
  readonly contentKind: "welcome" | "work" | "report"
  readonly turnStepListKind: "none" | "turn"
  readonly viewingPast: boolean
  readonly activity: WorkActivity
}

export type NowLine =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly activity: WorkActivity }

export function nowLineOf(source: NowLineSource): NowLine {
  const { contentKind, turnStepListKind, viewingPast, activity } = source
  if (
    contentKind !== "work" ||
    turnStepListKind !== "turn" ||
    viewingPast ||
    activity.tone === "asking"
  ) {
    return { kind: "none" }
  }
  return { kind: "shown", activity }
}
