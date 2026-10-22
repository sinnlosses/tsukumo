// メインビューの本文の欄から、描く順の欄の並びと節の見出しの並びを導く。

import { isBlankText } from "../utils/blank-text.ts"
import type { MainViewReportBody, MainViewReportRegion } from "./main-view-shape.ts"

/**
 * 本文を描く順の欄に並べる。空の欄は置かない。
 * `report` ツールの本文は、頭 → 節 → 振り返り → お願いの順。
 * お願いは HTML の中に Markdown を入れるので、塊の内側の前後に空行を空ける。
 */
export function orderedReportRegions(body: MainViewReportBody): readonly MainViewReportRegion[] {
  if (body.kind === "markdown") {
    return isBlankText(body.markdown) ? [] : [{ kind: "markdown", markdown: body.markdown }]
  }
  const regions: readonly MainViewReportRegion[] = [
    { kind: "head", markdown: body.head },
    ...body.sections.map((section): MainViewReportRegion => ({
      kind: "section",
      id: section.id,
      markdown: section.markdown,
    })),
    { kind: "retrospective", markdown: body.retrospective },
    {
      kind: "favor",
      id: body.favor.id,
      markdown: isBlankText(body.favor.markdown)
        ? ""
        : `<div class="note note-favor">\n\n${body.favor.markdown}\n\n</div>`,
    },
  ]
  return regions.filter((region) => !isBlankText(region.markdown))
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

/** 最終レポートの本文。頭を最終のときの頭に替える。 */
export function finalReportBody(body: MainViewReportBody): MainViewReportBody {
  return body.kind === "markdown" ? body : { ...body, head: body.finalHead }
}
