// 姿の差から、読み上げの領域で1回だけ読む文を導く。

import { conversationMoment } from "../../shared/session/conversation-moment.ts"
import type { SessionState } from "../../shared/session/session-state.ts"

/**
 * `previous` から `next` へ進んだ間に新しく起きたことを、読む順に返す。
 * 新しいセリフが先、局面の語が後。記録が縮んだ（会話が消えた）ときは何も読まない。
 */
export function announcementsBetween(
  previous: SessionState,
  next: SessionState,
): readonly string[] {
  return [...speechTexts(previous, next), ...momentTexts(previous, next)]
}

function speechTexts(previous: SessionState, next: SessionState): readonly string[] {
  if (next.records.length < previous.records.length) {
    return []
  }
  return next.records
    .slice(previous.records.length)
    .flatMap((record) => (record.kind === "speech" ? [record.text] : []))
}

/** 雑談モードでは読まない（局面は仕事のセッションのもの）。 */
function momentTexts(previous: SessionState, next: SessionState): readonly string[] {
  if (next.chatMode) {
    return []
  }
  const before = conversationMoment(previous)
  const after = conversationMoment(next)
  if (before === after) {
    return []
  }
  switch (after) {
    case "work":
      if (before === "ask") {
        return []
      }
      return [next.nextTurnId === previous.nextTurnId ? "続きを作業中" : "作業を始めた"]
    case "ask":
      return ["お伺いが届いた"]
    case "deliver":
      return ["レポートが届いた"]
    case "stumble":
      return ["失敗で終わった"]
    case "greet":
      return []
  }
}
