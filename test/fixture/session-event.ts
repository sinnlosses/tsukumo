// テストが共有する `SessionEvent` の作り手。イベントの形を直書きせず、ここから作る。

import type { RecordedPromptImage } from "../../src/shared/session-driver/prompt-image.ts"
import type { SessionEvent } from "../../src/shared/session/session-event.ts"
import { characterChangedEvent, shownPortraits } from "./character.ts"

export function requestEvent(
  text = "架空の依頼",
  images: readonly RecordedPromptImage[] = [],
): SessionEvent {
  return { kind: "request", text, images }
}

/** 見た目の編集・作る・消すが書けたときに流し直す `character-changed`（手で書いた架空のパック）。 */
export const CHARACTER_EVENT: SessionEvent = characterChangedEvent({
  ...shownPortraits({ default: "/character/default.png?v=fictional@2" }),
})

/** アイテムの一覧・席を変えられたときに流し直す `items-changed`（空の一覧）。 */
export const ITEMS_EVENT: SessionEvent = { kind: "items-changed", items: [], seats: {} }
