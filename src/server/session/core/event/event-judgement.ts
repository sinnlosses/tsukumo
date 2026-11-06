// 駆動から届いたイベントと、定着の結果に対する、セッションを持つ係の判断。

import type { CharacterPackName } from "../../../../shared/character-pack/character.ts"
import type { SessionEvent } from "../../../../shared/session/session-event.ts"
import type { SessionState } from "../../../../shared/session/session-state.ts"
import type { ChatConsolidationOutcome } from "../../../chat/core/consolidation/chat-consolidation-writer.ts"

/** 束に積んでブラウザへ配るか。計測のためだけのイベントは積まない。 */
export function isBatched(event: SessionEvent): boolean {
  return event.kind !== "token-usage" && event.kind !== "speak-drawn"
}

/** 定着を起こすパック。起こさないなら `undefined`。 */
export function consolidationPackToStart(
  event: SessionEvent,
  state: SessionState,
): CharacterPackName | undefined {
  return event.kind === "turn-finished" ? state.character?.pack : undefined
}

/**
 * 定着の結果の話題の見出しを今の代へ流してよいか。
 * 書けていて、まだ閉じておらず、いまが雑談で、起こした時点と同じパックのときだけ。
 */
export function mayFlowTopics(
  outcome: ChatConsolidationOutcome,
  closed: boolean,
  state: SessionState,
  packName: CharacterPackName,
): outcome is Extract<ChatConsolidationOutcome, { kind: "written" }> {
  return (
    outcome.kind === "written" && !closed && state.chatMode && state.character?.pack === packName
  )
}
