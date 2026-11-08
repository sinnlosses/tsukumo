// 送った言葉が流す `request` / `aside` のイベントを組む。指した所は補足メッセージにだけ載る。

import type { RecordedPromptImage } from "../../../shared/session-driver/prompt-image.ts"
import type { ReplyTarget } from "../../../shared/session/reply-target.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { PromptOpening } from "./session-driver.ts"

export function promptOpeningEvent(
  opening: PromptOpening,
  text: string,
  images: readonly RecordedPromptImage[],
  target?: ReplyTarget,
): SessionEvent {
  if (opening === "request") {
    return { kind: "request", text, images }
  }
  return target === undefined
    ? { kind: "aside", text, images }
    : { kind: "aside", text, images, target }
}
