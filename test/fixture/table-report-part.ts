import { reportEvents } from "../../src/server/session-driver/core/message/sdk-report-message.ts"
import { mainViewEntries } from "../../src/shared/session/main-view-entry.ts"
import type { MainViewReportRegions } from "../../src/shared/session/main-view-shape.ts"
import type { ReportCalledEvent } from "../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../src/shared/session/session-state.ts"
import { checkedToolUseId } from "./tool-use-id.ts"

export const ROWS = [
  ["ぼ", "甲", "10"],
  ["あ", "乙", "9"],
  ["ん", "甲", "100"],
]

export const INTERACTIVE = { sortable: true, filterable: true }

export function reportParts(table: Readonly<Record<string, unknown>>, withPicker = true) {
  return [
    { id: "root", component: "Report", conclusion: ["架空の結論。"], children: ["s1"] },
    {
      id: "s1",
      component: "Section",
      heading: "架空の操作",
      children: withPicker ? ["pick", "t1"] : ["t1"],
    },
    {
      id: "pick",
      component: "ChoicePicker",
      label: "架空の種別",
      options: [
        { label: "甲", value: "甲" },
        { label: "乙", value: "乙" },
        { label: "丙", value: "丙" },
      ],
      value: { path: "/view/t1/filter" },
    },
    {
      id: "t1",
      component: "Table",
      title: "架空の表",
      columns: ["架空の名", "架空の種別", "架空の数"],
      rows: ROWS,
      ...table,
    },
  ].filter((part) => withPicker || part.id !== "pick")
}

/** 書き手の入り口を通した呼び出しの本文。 */
export function regionsOf(components: readonly unknown[]): MainViewReportRegions {
  const [event] = reportEvents(checkedToolUseId("toolu_fictional"), { components }, [])
  if (event?.kind !== "report") throw new Error("report にならなかった")
  return regionsOfEvent(event)
}

/** 記録済みの呼び出しの読み戻し。`reportEvents` を通すので、外した `ChoicePicker` を結んだ旧い表も描ける。 */
export function readBackRegionsOf(components: readonly unknown[]): MainViewReportRegions {
  return regionsOf(components)
}

function regionsOfEvent(event: ReportCalledEvent): MainViewReportRegions {
  const entry = mainViewEntries(applySessionEvent(INITIAL_SESSION_STATE, event, 0)).find(
    (candidate) => candidate.kind === "report",
  )
  if (entry?.kind !== "report") throw new Error("レポートの記録が無い")
  return entry.regions
}
