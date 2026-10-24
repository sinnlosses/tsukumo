// やり取りの列のレポートの行（見ているやり取りの行の下、節の行の上）に出すラベルと題。

import type { MainViewTurn } from "../../../../../../../shared/session/main-view-shape.ts"
import { shownTextStepOf } from "./headed-section.ts"

/**
 * `final` は最終レポート、`interim` はまだ最終でない最後のレポート。
 * 本文が1つも無い（または題にできる字が無い）やり取りは `none` で、行を出さない。
 */
export type OutlineReport =
  | { readonly kind: "none" }
  | { readonly kind: "report"; readonly label: "final" | "interim"; readonly title: string }

const NO_REPORT = { kind: "none" } as const satisfies OutlineReport

/** 題はタスクのレポートならタスクの名前、無ければレポートの先頭行。 */
export function outlineReportOf(turn: MainViewTurn): OutlineReport {
  const shown = shownTextStepOf(turn)
  if (shown?.body.kind !== "text") {
    return NO_REPORT
  }
  const title = (shown.body.task.kind === "task" ? shown.body.task.name : shown.body.firstLine)
    .replace(/\s+/g, " ")
    .trim()
  return title === ""
    ? NO_REPORT
    : { kind: "report", label: shown.final ? "final" : "interim", title }
}
