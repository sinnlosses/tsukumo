// メインビューの本文から、描くものがあるかと節の見出しの並びを導く。

import type { MainViewReportBody } from "../../../shared/session/main-view-shape.ts"
import { isBlankText } from "../../../shared/utils/blank-text.ts"

/**
 * 本文に描くものが1つでもあるか。
 * `report` ツールの本文は、頭・お願い・節（面の図と振り返りを含む）のどれかが残るかを面の値から数える。
 */
export function reportDrawsAnything(body: MainViewReportBody): boolean {
  if (body.kind === "markdown") {
    return !isBlankText(body.markdown)
  }
  const { a2ui } = body
  const { lead, keyFigures, checks, status } = a2ui.head
  return (
    lead.kind !== "none" ||
    keyFigures.length > 0 ||
    checks.kind !== "none" ||
    status.phaseTimes.kind !== "none" ||
    status.changedFiles.kind !== "none" ||
    !isBlankText(a2ui.favor.text) ||
    (a2ui.kind === "surface" &&
      (Object.keys(a2ui.sections).length > 0 ||
        a2ui.figure.kind === "leaves" ||
        a2ui.retrospective.kind === "leaves"))
  )
}

/** 見出しのある節の欄の ID と見出しの字。見出しの無い節と、`report` ツールの外の本文は数えない。 */
export function reportHeadedSections(
  body: MainViewReportBody,
): readonly { readonly id: number; readonly heading: string }[] {
  return body.kind === "markdown"
    ? []
    : body.sections.flatMap((section) =>
        section.heading === "" ? [] : [{ id: section.id, heading: section.heading }],
      )
}

/** 最終レポートの本文。面の頭の段ごとの所要時間と変更したファイルを、最終のときのものに替える。 */
export function finalReportBody(body: MainViewReportBody): MainViewReportBody {
  if (body.kind === "markdown") {
    return body
  }
  const { a2ui } = body
  return {
    ...body,
    head: body.finalHead,
    a2ui: { ...a2ui, head: { ...a2ui.head, status: a2ui.head.finalStatus } },
  }
}
