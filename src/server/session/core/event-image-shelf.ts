// 駆動から届いたイベントが指す画像（`report` の画像の塊と、積まれた質問の preview）を棚へ置く。

import { drawnSectionsOf } from "../../../shared/report/report-retrospective.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { SessionState } from "../../../shared/session/session-state.ts"
import { questionImagePaths } from "../../report/core/question-image-path.ts"
import { type ReadReportImagePath, reportImagePaths } from "../../report/core/report-image-shelf.ts"
import type { SessionManagerOptions } from "./session-manager-port.ts"

/**
 * 画像を置いて、畳むイベントを返す。`report` は測れた寸法と置けなかったパスを `imageSizes`・`unshelvedImages` に載せたもの、
 * `pending-changed` は積まれた質問に同じ2つを載せたもの、ほかは受けたまま。
 * 寸法は同じ `report` のイベントに載せる（別のイベントにすると、束の先頭の1件だけが先に配られ、寸法の無いレポートが描かれる）。
 * `state` は畳む前の姿で、答え待ちに既にある質問は置き直さない。
 */
export function shelveEventImages(
  options: Pick<SessionManagerOptions, "reportImageShelf" | "readReportImage">,
  state: Pick<SessionState, "pending">,
  event: SessionEvent,
): SessionEvent {
  const read: ReadReportImagePath = (path) =>
    options.readReportImage(path, Number.POSITIVE_INFINITY)
  if (event.kind === "report") {
    const { sizes, unshelved } = options.reportImageShelf.shelve(
      event.toolUseId,
      reportImagePaths(drawnSectionsOf(event)),
      read,
    )
    return { ...event, imageSizes: sizes, unshelvedImages: unshelved }
  }
  if (event.kind === "pending-changed") {
    const shelvedAsks = new Map(state.pending.map((ask) => [ask.id, ask]))
    return {
      ...event,
      pending: event.pending.map((ask) => {
        if (ask.kind !== "question") {
          return ask
        }
        const earlier = shelvedAsks.get(ask.id)
        if (earlier?.kind === "question") {
          return {
            ...ask,
            imageSizes: earlier.imageSizes,
            unshelvedImages: earlier.unshelvedImages,
          }
        }
        const { sizes, unshelved } = options.reportImageShelf.shelve(
          ask.id,
          questionImagePaths(ask),
          read,
        )
        return { ...ask, imageSizes: sizes, unshelvedImages: unshelved }
      }),
    }
  }
  return event
}
