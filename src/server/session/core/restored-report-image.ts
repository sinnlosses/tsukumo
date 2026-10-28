// 続きから復元した再生のうち、記録の窓に残った24時間以内の `report` の画像を棚へ置き直す。

import { drawnLeaves, reportOutline } from "../../../shared/report/report-outline.ts"
import type { RestoredEvent } from "../../../shared/session/session-event.ts"
import type { SessionState } from "../../../shared/session/session-state.ts"
import { reportImagePaths, type ShelvedImages } from "../../report/core/report-image-shelf.ts"
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
  const shelvings = new Map<string, ShelvedImages>()
  for (const { event, time } of events) {
    if (
      event.kind === "report" &&
      kept.has(event.toolUseId) &&
      time.kind === "known" &&
      restoredAt - time.at <= RESTORED_REPORT_IMAGE_WINDOW_MS
    ) {
      shelvings.set(
        event.toolUseId,
        options.reportImageShelf.shelve(
          event.toolUseId,
          reportImagePaths(drawnLeaves(reportOutline(event.components))),
          (path) => options.readReportImage(path, time.at),
        ),
      )
    }
  }
  if (
    ![...shelvings.values()].some(
      ({ sizes, unshelved }) => sizes.length > 0 || unshelved.length > 0,
    )
  ) {
    return state
  }
  return {
    ...state,
    records: state.records.map((record) => {
      if (record.kind !== "report") {
        return record
      }
      const shelving = shelvings.get(record.toolUseId)
      return shelving === undefined
        ? record
        : { ...record, imageSizes: shelving.sizes, unshelvedImages: shelving.unshelved }
    }),
  }
}
