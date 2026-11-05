// サーバ側で持つセッションの状態の入れ物。状態を書き換えるのは `replace` だけ。

import type { SessionState } from "../../../shared/session/session-state.ts"
import {
  releasedImageToolUseIds,
  type ReportImageShelf,
} from "../../report/core/image/report-image-shelf.ts"
import {
  type PromptImageShelf,
  releasedPromptImageIds,
} from "../../session-driver/core/prompt-image-shelf.ts"

export type SessionStateBox = {
  readonly current: () => SessionState
  /**
   * 状態を差し替える。
   * 記録から消えた依頼の原寸とレポートの画像は、ここで置き場から捨てる（集計期間から落ちた・起こし直して空に戻った）。
   * 状態を書き換えるのはここだけにして、置き場の寿命が記録の集計期間から外れないようにする。
   */
  readonly replace: (next: SessionState) => void
}

type SessionStateShelves = {
  readonly promptImageShelf: PromptImageShelf
  readonly reportImageShelf: ReportImageShelf
}

export function createSessionStateBox(
  initial: SessionState,
  shelves: SessionStateShelves,
): SessionStateBox {
  let state = initial
  return {
    current: () => state,
    replace: (next) => {
      if (next.records !== state.records) {
        shelves.promptImageShelf.release(releasedPromptImageIds(state.records, next.records))
      }
      if (next.records !== state.records || next.pending !== state.pending) {
        shelves.reportImageShelf.release(releasedImageToolUseIds(state, next))
      }
      state = next
    },
  }
}
