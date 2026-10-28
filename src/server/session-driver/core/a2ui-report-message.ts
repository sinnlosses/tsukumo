// `report` の `a2ui` の版の引数（部品の平らな一覧 `components`）を、旧い版の引数の形に組み直す。
// 組み直した引数は旧い版と同じ取り出し（`reportEvents`）を通る。
//
// 会話の内容がここを通る。
// 持ち出す先は呼び出し側の `reportEvents` だけで、ログにもファイルにも書かない。

import { omit } from "remeda"

import {
  type A2uiReportComponent,
  a2uiReportComponentSchema,
} from "../../../shared/report/a2ui-report-catalog.ts"
import {
  A2UI_ROOT_ID,
  type A2uiReportPart,
  a2uiLeafIds,
  a2uiLeafKind,
  a2uiOutlineSections,
  a2uiPartsById,
} from "../../../shared/report/a2ui-report-outline.ts"

/** 組み直した結果。`input` は旧い版の引数の形、`droppedCount` は部品の形に合わず落とした要素の数。 */
export type A2uiReportInput = {
  readonly input: Readonly<Record<string, unknown>>
  readonly components: readonly A2uiReportComponent[]
  readonly droppedCount: number
}

/**
 * 部品の一覧を組み直す。部品の形に合わない要素は落として数える。
 * id が `root` の `Report` の props を旧い版の最上位の欄に、`Report.children` の `Section` を節に、
 * `figure` と `retrospective.blocks` の ID の葉を塊に写す。
 * 構造の規約に外れた一覧も落ちずに写す: 辿れない参照は飛ばし、入れ子の `Section` と配置の部品の中の葉は外側の節へ並び順に平らに入れ、
 * 根の子の葉は見出しの無い節に入れる。根が無ければ欄の無い引数になる。
 */
export function a2uiReportInput(components: readonly unknown[]): A2uiReportInput {
  const parsed = components.flatMap((component) => {
    const result = a2uiReportComponentSchema.safeParse(component)
    return result.success ? [result.data] : []
  })
  const byId = a2uiPartsById(parsed)
  const root = byId.get(A2UI_ROOT_ID)
  return {
    input: root?.component === "Report" ? reportInput(root, byId) : {},
    components: parsed,
    droppedCount: components.length - parsed.length,
  }
}

function reportInput(
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
