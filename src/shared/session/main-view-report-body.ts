// メインビューの本文の欄から、描く側がまだ読む連結した Markdown と節の見出しの並びを導く。

import { htmlAttribute } from "../report/report-inline-markdown.ts"
import { SECTION_BREAK_MARKDOWN, SECTIONS_START_MARKDOWN } from "../report/report-markdown.ts"
import { isBlankText } from "../utils/blank-text.ts"
import type { MainViewReportBody } from "./main-view-shape.ts"

/**
 * 本文を1本の Markdown に連結する。
 * `report` ツールの本文は、頭 → 節の始まりの印 → 節（間に節の境目の印）→ 振り返り → お願いの順で、空の欄は置かない。
 * 節の始まりの印は、頭と節がどちらもあるときだけ置く。
 * お願いは HTML の中に Markdown を入れるので、塊の内側の前後に空行を空ける。
 */
export function reportBodyMarkdown(body: MainViewReportBody): string {
  if (body.kind === "markdown") {
    return body.markdown
  }
  const sections = body.sections
    .map((section) => section.markdown)
    .join(`\n\n${SECTION_BREAK_MARKDOWN}\n\n`)
  return [
    body.head,
    !isBlankText(body.head) && !isBlankText(sections) ? SECTIONS_START_MARKDOWN : "",
    sections,
    body.retrospective,
    isBlankText(body.favor.markdown)
      ? ""
      : `<div class="note note-favor" id="${htmlAttribute(body.favor.id)}">\n\n${body.favor.markdown}\n\n</div>`,
  ]
    .filter((part) => !isBlankText(part))
    .join("\n\n")
}

/** 描く節の見出しの字の並び。見出しの無い節と、`report` ツールの外の本文は数えない。 */
export function reportBodyHeadings(body: MainViewReportBody): readonly string[] {
  return body.kind === "markdown"
    ? []
    : body.sections.map((section) => section.heading).filter((heading) => heading !== "")
}

/** 最終レポートの本文。頭を最終のときの頭に替える。 */
export function finalReportBody(body: MainViewReportBody): MainViewReportBody {
  return body.kind === "markdown" ? body : { ...body, head: body.finalHead }
}
