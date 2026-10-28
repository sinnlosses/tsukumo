// 書いている途中の `report`（`a2ui` の版）の引数の断片から、部品が閉じるたびに 1 つずつ取り出して `report-draft-component` にする。
// 塊ごとの切り出しの状態はここだけが持つ（`toSessionEvents` は状態を持たない）。
//
// 会話の内容がここを通る。
// 断片と切り出した JSON はこのファイルのメモリだけに置き、ログにもファイルにも書かない。
// 出すのは `a2uiReportComponentSchema` を通った部品だけ。

import { isPlainObject } from "remeda"

import { a2uiReportComponentSchema } from "../../../shared/report/a2ui-report-catalog.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { REPORT_TOOL_NAME, tsukumoToolFullName } from "../../core/tsukumo-tool-name.ts"
import { INITIAL_SPLIT_STATE, splitComponents, type SplitState } from "./a2ui-component-splitter.ts"

/** 開いている `report` の塊 1 つ分（`index` は塊の位置）。 */
type OpenBlock = { readonly toolUseId: string; readonly split: SplitState }

/**
 * 駆動の側で部品の切り出しを持つ口。セッション1つに1つ。
 * メインのメッセージを順に見せる。メインの `report` の塊が開いてから閉じるまでの `input_json_delta` を読み、
 * 部品が閉じたぶんだけ `report-draft-component` を返す。
 */
export type ReportDraftIntake = {
  readonly observe: (message: unknown) => readonly SessionEvent[]
}

/** {@link ReportDraftIntake} を1つ作る。 */
export function createReportDraftIntake(): ReportDraftIntake {
  let blocks: ReadonlyMap<number, OpenBlock> = new Map()

  const observeEvent = (event: Readonly<Record<string, unknown>>): readonly SessionEvent[] => {
    if (event.type === "message_start") {
      blocks = new Map()
      return []
    }
    if (typeof event.index !== "number") {
      return []
    }
    const index = event.index
    if (event.type === "content_block_stop") {
      blocks = withoutBlock(blocks, index)
      return []
    }
    if (event.type === "content_block_start") {
      const block = event.content_block
      if (
        isPlainObject(block) &&
        block.type === "tool_use" &&
        block.name === tsukumoToolFullName(REPORT_TOOL_NAME) &&
        typeof block.id === "string"
      ) {
        blocks = new Map([...blocks, [index, { toolUseId: block.id, split: INITIAL_SPLIT_STATE }]])
      }
      return []
    }
    const open = blocks.get(index)
    if (
      open === undefined ||
      event.type !== "content_block_delta" ||
      !isPlainObject(event.delta) ||
      event.delta.type !== "input_json_delta" ||
      typeof event.delta.partial_json !== "string"
    ) {
      return []
    }
    return readFragment(index, open, event.delta.partial_json)
  }

  // 閉じた要素が JSON として読めなければ（引数が壊れている）、その塊の切り出しをやめる。例外の文は断片を含みうるので捨てる。
  const readFragment = (
    index: number,
    open: OpenBlock,
    fragment: string,
  ): readonly SessionEvent[] => {
    try {
      const step = splitComponents(open.split, fragment)
      blocks = new Map([...blocks, [index, { ...open, split: step.state }]])
      return step.components.flatMap((component): readonly SessionEvent[] => {
        const parsed = a2uiReportComponentSchema.safeParse(component)
        return parsed.success
          ? [{ kind: "report-draft-component", toolUseId: open.toolUseId, component: parsed.data }]
          : []
      })
    } catch {
      blocks = withoutBlock(blocks, index)
      return []
    }
  }

  return {
    observe: (message) =>
      isPlainObject(message) &&
      message.type === "stream_event" &&
      typeof message.parent_tool_use_id !== "string" &&
      isPlainObject(message.event)
        ? observeEvent(message.event)
        : [],
  }
}

function withoutBlock(
  blocks: ReadonlyMap<number, OpenBlock>,
  index: number,
): ReadonlyMap<number, OpenBlock> {
  return new Map([...blocks].filter(([key]) => key !== index))
}
