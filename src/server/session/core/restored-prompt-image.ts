// 続きから復元した再生の依頼・脇の話に、transcript から読み戻した原寸を棚へ置いて写す。

import type { RestoredEvent } from "../../../shared/session/session-event.ts"
import type { SessionRecord } from "../../../shared/session/session-record.ts"
import {
  type PromptImageShelf,
  recordedPromptImageIds,
} from "../../session-driver/core/prompt-image-shelf.ts"

/** 原寸を棚に置き、振られた id を依頼・脇の話の `images` に写した再生を返す。 */
export function shelveRestoredPromptImages(
  shelf: Pick<PromptImageShelf, "shelveRestored">,
  events: readonly RestoredEvent[],
): readonly RestoredEvent[] {
  return events.map((restored) => {
    const { event, promptImages } = restored
    if (promptImages.length === 0 || (event.kind !== "request" && event.kind !== "aside")) {
      return restored
    }
    return { ...restored, event: { ...event, images: shelf.shelveRestored(promptImages) } }
  })
}

/** 再生で棚に置いた原寸のうち、畳んだ記録に残らなかった（記録の窓から溢れた）ものの id。 */
export function unrecordedRestoredPromptImageIds(
  events: readonly RestoredEvent[],
  records: readonly SessionRecord[],
): readonly string[] {
  const recorded = new Set(recordedPromptImageIds(records))
  return events.flatMap(({ event }) =>
    event.kind === "request" || event.kind === "aside"
      ? event.images.map((image) => image.id).filter((id) => !recorded.has(id))
      : [],
  )
}
