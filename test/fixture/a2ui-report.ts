// `report` の入力を、節と塊の並びの書き方から A2UI の部品の一覧 `components` に組む。
// テストは本文を「節の並びと、塊の `kind`」で書き、モデルが見る入力の形にはここで直す。

import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk"
import { omit } from "remeda"

import { LEAF_COMPONENT_KINDS } from "../../src/shared/report/a2ui-report-catalog.ts"
import { callTool } from "./mcp-server.ts"

type BlockFields = {
  readonly kind: string
  readonly [field: string]: unknown
}

type SectionFields = {
  readonly heading?: string
  readonly blocks: readonly BlockFields[]
}

/** `figure` は塊1つか、`{ kind: "none", reason }`（図を置かない理由）。 */
type ReportFields = {
  readonly sections?: readonly SectionFields[]
  readonly figure?: BlockFields
  readonly [field: string]: unknown
}

const DEFAULT_SECTIONS: readonly SectionFields[] = [
  { blocks: [{ kind: "text", text: "架空の本文。" }] },
]

const COMPONENT_OF_KIND: ReadonlyMap<string, string> = new Map(
  Object.entries(LEAF_COMPONENT_KINDS).map(([component, kind]) => [kind, component]),
)

function leafOf(id: string, block: BlockFields) {
  const component = COMPONENT_OF_KIND.get(block.kind)
  if (component === undefined) {
    throw new Error(`部品にできない塊の kind: ${block.kind}`)
  }
  return { id, component, ...omit(block, ["kind"]) }
}

/**
 * `report` に渡す入力（`components`）。
 * 節ごとに `Section`、塊ごとに葉の部品を作り、`figure` は根の `figure`（図を置かない理由なら `figureNone`）に写す。
 * `sections` を省くと、地の文1つの節を1つ置く。
 */
export function reportInput(fields: ReportFields = {}) {
  const { sections = DEFAULT_SECTIONS, figure, ...rest } = fields
  const sectionParts = sections.map((section, index) => ({
    id: `s${String(index + 1)}`,
    component: "Section",
    ...(section.heading === undefined ? {} : { heading: section.heading }),
    children: section.blocks.map((_, position) => `s${String(index + 1)}b${String(position + 1)}`),
  }))
  const leaves = sections.flatMap((section, index) =>
    section.blocks.map((block, position) =>
      leafOf(`s${String(index + 1)}b${String(position + 1)}`, block),
    ),
  )
  const figurePart =
    figure === undefined || figure.kind === "none" ? undefined : leafOf("fig", figure)
  const figureNone = figure?.kind === "none" ? figure["reason"] : undefined
  const root = {
    id: "root",
    component: "Report",
    ...rest,
    ...(figurePart === undefined ? {} : { figure: figurePart.id }),
    ...(figureNone === undefined ? {} : { figureNone }),
    children: sectionParts.map((part) => part.id),
  }
  return {
    components: [
      root,
      ...sectionParts,
      ...leaves,
      ...(figurePart === undefined ? [] : [figurePart]),
    ],
  }
}

/** `report` を節と塊の並びの書き方で呼ぶ。 */
export function callReport(server: McpSdkServerConfigWithInstance, fields: ReportFields = {}) {
  return callTool(server, "report", reportInput(fields))
}
