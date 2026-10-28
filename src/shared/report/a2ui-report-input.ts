// `report` の `a2ui` の版の部品の一覧を、旧い版の引数の欄に写す。
//
// 会話の内容がここを通る。ログにもファイルにも書かない。

import { omit } from "remeda"

import type { A2uiReportComponent } from "./a2ui-report-catalog.ts"
import {
  type A2uiReportPart,
  a2uiLeafIds,
  a2uiLeafKind,
  a2uiOutlineSections,
} from "./a2ui-report-outline.ts"

/**
 * 根の `Report` の props を旧い版の最上位の欄に、`Report.children` を節に、
 * `figure` と `retrospective.blocks` の ID の葉を塊に写す。
 * 辿れない参照は飛ばし、入れ子の `Section` と配置の部品の中の葉は外側の節へ並び順に平らに入れ、
 * 根の子の葉は見出しの無い節に入れる。
 */
export function a2uiReportFields(
  root: A2uiReportPart<"Report">,
  byId: ReadonlyMap<string, A2uiReportComponent>,
): Readonly<Record<string, unknown>> {
  const blocksOf = (ids: readonly string[]) => leafBlocks(a2uiLeafIds(ids, byId), byId)
  const figure = root.figure === undefined ? undefined : blocksOf([root.figure])[0]
  return {
    ...omit(root, ["id", "component", "children", "figure", "figureNone", "retrospective"]),
    ...(figure !== undefined
      ? { figure }
      : root.figureNone !== undefined
        ? { figure: { kind: "none", reason: root.figureNone } }
        : {}),
    ...(root.retrospective === undefined
      ? {}
      : {
          retrospective: {
            ...root.retrospective,
            ...(root.retrospective.blocks === undefined
              ? {}
              : { blocks: blocksOf(root.retrospective.blocks) }),
          },
        }),
    sections: a2uiOutlineSections(root, byId).map((section) => {
      const blocks = leafBlocks(section.leafIds, byId)
      return section.kind === "section" ? { heading: section.heading, blocks } : { blocks }
    }),
  }
}

function leafBlocks(
  leafIds: readonly string[],
  byId: ReadonlyMap<string, A2uiReportComponent>,
): readonly Readonly<Record<string, unknown>>[] {
  return leafIds.flatMap((id) => {
    const part = byId.get(id)
    const kind = part === undefined ? undefined : a2uiLeafKind(part)
    return part === undefined || kind === undefined
      ? []
      : [{ kind, ...omit(part, ["id", "component"]) }]
  })
}
