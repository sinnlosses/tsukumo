// 続きから復元した再生のうち、記録の窓に残った24時間以内の `report` の画像を棚へ置き直す。

import { sectionsWithFigure } from "../../../shared/report/report-block.ts"
import type { ReportImageSize } from "../../../shared/report/report-image.ts"
import type { RestoredEvent } from "../../../shared/session/session-event.ts"
import type { SessionState } from "../../../shared/session/session-state.ts"
import { reportImagePaths } from "../../report/core/report-image-shelf.ts"
import type { SessionManagerOptions } from "./session-manager-port.ts"

/** 続きから復元した report の画像を読み直す、復元した時点からの遡り幅。 */
const RESTORED_REPORT_IMAGE_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * `state` は再生を畳んだあとの姿。記録に残った `report` だけを、更新時刻がその出来事の時刻以前の画像に限って置く。
 * 返すのは、置き直したときに測れた寸法をその `report` の記録に写した姿。
 */
export function shelveRestoredReportImages(
  options: Pick<SessionManagerOptions, "reportImageShelf" | "readReportImage">,
  state: SessionState,
  events: readonly RestoredEvent[],
  restoredAt: number,
): SessionState {
  const kept = new Set(
    state.records.flatMap((record) => (record.kind === "report" ? [record.toolUseId] : [])),
  )
  const sizes = new Map<string, readonly ReportImageSize[]>()
  for (const { event, time } of events) {
    if (
      event.kind === "report" &&
      kept.has(event.toolUseId) &&
      time.kind === "known" &&
      restoredAt - time.at <= RESTORED_REPORT_IMAGE_WINDOW_MS
    ) {
      sizes.set(
        event.toolUseId,
        options.reportImageShelf.shelve(
          event.toolUseId,
          reportImagePaths(sectionsWithFigure(event.figure, event.sections)),
          (path) => options.readReportImage(path, time.at),
        ),
      )
    }
  }
  if (![...sizes.values()].some((measured) => measured.length > 0)) {
    return state
  }
  return {
    ...state,
    records: state.records.map((record) => {
      if (record.kind !== "report") {
        return record
      }
      const imageSizes = sizes.get(record.toolUseId) ?? []
      return imageSizes.length === 0 ? record : { ...record, imageSizes }
    }),
  }
}
