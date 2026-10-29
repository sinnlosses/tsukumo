// 旧い変種の `report` の引数（`sections`・`body`）を、`a2ui` の版の部品の平らな一覧 `components` に組み直す。
// 旧い transcript の復元も新しい呼び出しと同じ経路（部品の一覧）に乗せるための変換。
//
// 会話の内容がここを通る。ログにもファイルにも書かない。

import { isPlainObject, omit } from "remeda"

import {
  LEAF_COMPONENT_KINDS,
  parseReportFigure,
  REPORT_COMPONENT_SCHEMAS,
} from "../../../shared/report/a2ui-report-catalog.ts"
import { A2UI_ROOT_ID } from "../../../shared/report/a2ui-report-outline.ts"
import { parseKeyFigures } from "../../../shared/report/report-block-comparison.ts"
import type { ReportBlock } from "../../../shared/report/report-block.ts"
import { parseReportChecks } from "../../../shared/report/report-check.ts"
import { parseReportRetrospective } from "../../../shared/report/report-retrospective.ts"
import {
  type LegacyBlock,
  parseLegacyBody,
  parseLegacySections,
} from "./legacy-report-section-list.ts"

/** 組み直した結果。件数は旧い塊の読みで落とした・素のコードブロックに落とした数。 */
export type LegacyReportComponents = {
  readonly components: readonly Readonly<Record<string, unknown>>[]
  readonly unknownBlockCount: number
  readonly brokenFenceCount: number
}

/** `Report` の props のうち、最上位の欄をそのまま写すもの。 */
const PLAIN_ROOT_KEYS = [
  "task",
  "workPlanClosing",
  "favor",
  "title",
  "sessionSummary",
  "sessionRemaining",
] as const

const COMPONENT_OF_KIND: ReadonlyMap<string, string> = new Map(
  Object.entries(LEAF_COMPONENT_KINDS).map(([component, kind]) => [kind, component]),
)

/**
 * 旧い引数を部品の一覧に組み直す。`sections` があればそれを、無ければ `body`（Markdown）を、今の読みで塊にして写す。
 * 節は `Section`、葉は同名の部品、`row` は `Row`、`panel` は `Card` と `Column`（題は先頭の `Paragraph`）、
 * `figure` は `Report.figure` と `figureNone`、振り返りの塊は `Report.retrospective.blocks` に写す。部品の ID は並びの位置から振る。
 * 失うのは `shapeTag`・`files` の塊・知らない種類で落とした塊・`row`/`panel` の `fold`/`aside`。
 * 節が1つも残らない引数は、`Report.children` を空にできないので undefined。
 */
export function legacyReportComponents(
  input: Readonly<Record<string, unknown>>,
): LegacyReportComponents | undefined {
  const parsed =
    input.sections === undefined
      ? parseLegacyBody(typeof input.body === "string" ? input.body : "")
      : { ...parseLegacySections(input.sections), brokenFenceCount: 0 }

  const sections = parsed.sections.flatMap((section, index) => {
    const id = `section-${String(index + 1)}`
    const children = section.blocks.flatMap((block, position) =>
      blockParts(`${id}-${String(position + 1)}`, block),
    )
    return children.length === 0
      ? []
      : [
          {
            id,
            parts: [
              {
                id,
                component: "Section",
                heading: section.heading,
                children: children.map((child) => child.id),
              },
              ...children.flatMap((child) => child.parts),
            ],
          },
        ]
  })
  const conclusion = conclusionOf(input.conclusion)
  if (sections.length === 0 || conclusion === "invalid") {
    return undefined
  }

  const figure = parseReportFigure(input.figure)
  const figureParts = figure.kind === "none" ? [] : leafPart("figure", figure)
  const retrospective = parseReportRetrospective(input.retrospective)
  const retrospectiveParts =
    retrospective.kind === "recorded"
      ? retrospective.blocks.flatMap((block, index) =>
          leafPart(`retrospective-${String(index + 1)}`, block),
        )
      : []

  const root = {
    id: A2UI_ROOT_ID,
    component: "Report",
    ...(conclusion === "absent" ? {} : { conclusion }),
    ...plainRootProps(input),
    ...speechProps(input),
    ...keyFiguresProps(input.keyFigures),
    ...checksProps(input.checks),
    ...(figureParts.length > 0
      ? { figure: "figure" }
      : figure.kind === "none" && figure.reason !== "unrecorded"
        ? { figureNone: figure.reason }
        : {}),
    ...(retrospective.kind === "recorded"
      ? {
          retrospective: {
            summary: retrospective.summary,
            drafts: retrospective.drafts,
            ...(retrospectiveParts.length > 0
              ? { blocks: retrospectiveParts.map((part) => part.id) }
              : {}),
          },
        }
      : {}),
    children: sections.map((section) => section.id),
  }

  return {
    components: [
      root,
      ...sections.flatMap((section) => section.parts),
      ...figureParts,
      ...retrospectiveParts,
    ],
    unknownBlockCount: parsed.unknownBlockCount,
    brokenFenceCount: parsed.brokenFenceCount,
  }
}

type Part = Readonly<Record<string, unknown>> & { readonly id: string }

/** 節の塊 1 つが写る部品。`id` は節の子として参照する部品、`parts` はその部品と、その下に降りる部品。 */
type BlockParts = { readonly id: string; readonly parts: readonly Part[] }

function blockParts(id: string, block: LegacyBlock): readonly BlockParts[] {
  if (block.kind === "row") {
    const children = block.blocks.flatMap((child, index) =>
      leafPart(`${id}-${String(index + 1)}`, child),
    )
    return [
      {
        id,
        parts: [{ id, component: "Row", children: children.map((child) => child.id) }, ...children],
      },
    ]
  }
  if (block.kind === "panel") {
    const bodyId = `${id}-body`
    const titleId = `${id}-title`
    const children = block.blocks.flatMap((child, index) =>
      leafPart(`${id}-${String(index + 1)}`, child),
    )
    return [
      {
        id,
        parts: [
          { id, component: "Card", child: bodyId },
          {
            id: bodyId,
            component: "Column",
            children: [titleId, ...children.map((child) => child.id)],
          },
          { id: titleId, component: "Paragraph", text: block.title },
          ...children,
        ],
      },
    ]
  }
  return leafPart(id, block).map((part) => ({ id, parts: [part] }))
}

/** 葉の塊 1 つが写る部品。部品の無い種類（`files`）は空。 */
function leafPart(id: string, block: ReportBlock): readonly Part[] {
  const component = COMPONENT_OF_KIND.get(block.kind)
  return component === undefined ? [] : [{ id, component, ...omit(block, ["kind"]) }]
}

/** `conclusion` は文字列（引数が文字列だったころ）も配列に直す。文字列でも文字列の配列でもなければ `invalid`。 */
function conclusionOf(value: unknown): readonly string[] | "absent" | "invalid" {
  if (value === undefined) {
    return "absent"
  }
  if (typeof value === "string") {
    return [value]
  }
  return Array.isArray(value) && value.every((item: unknown) => typeof item === "string")
    ? value.filter((item): item is string => typeof item === "string")
    : "invalid"
}

/** 根の schema が受ける欄だけを写す（受けない値で根ごと落とさない）。 */
function plainRootProps(
  input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    PLAIN_ROOT_KEYS.flatMap((key) => {
      const parsed = REPORT_COMPONENT_SCHEMAS.Report.shape[key].safeParse(input[key])
      return parsed.success && parsed.data !== undefined ? [[key, parsed.data]] : []
    }),
  )
}

/** `closing`・`waitingLine` は表情を省いた形も受け、表情は `default` に直す（表情の照合は取り出し側）。 */
function speechProps(input: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    (["closing", "waitingLine"] as const).flatMap((key) => {
      const value = input[key]
      return isPlainObject(value) && typeof value.text === "string"
        ? [
            [
              key,
              {
                text: value.text,
                expression: typeof value.expression === "string" ? value.expression : "default",
              },
            ],
          ]
        : []
    }),
  )
}

/** `figure`・`command`・`howToVerify` を持たなかったころの記録も、読み戻しの形で受ける。 */
function checksProps(value: unknown): Readonly<Record<string, unknown>> {
  const checks = parseReportChecks(value)
  return checks.length === 0 ? {} : { checks }
}

function keyFiguresProps(value: unknown): Readonly<Record<string, unknown>> {
  const keyFigures = parseKeyFigures(value)
  return keyFigures.length === 0 ? {} : { keyFigures }
}
