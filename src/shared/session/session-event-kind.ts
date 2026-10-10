// `SessionEvent` の種類の名前を、実行時に確かめられる形で持つ。
// `SessionEvent` に種類を足すと、この表が欠けて型検査で落ちる。

import type { SessionEvent } from "./session-event.ts"

const SESSION_EVENT_KINDS = {
  "session-info": true,
  "command-descriptions": true,
  plan: true,
  request: true,
  aside: true,
  "turn-started": true,
  "turn-resumed": true,
  "partial-utterance": true,
  utterance: true,
  speech: true,
  "speak-called": true,
  "report-drafting": true,
  report: true,
  "report-rejected": true,
  "work-plan": true,
  "work-plan-called": true,
  "delegate-returned": true,
  "tool-started": true,
  "tool-finished": true,
  "background-tool-finished": true,
  "pending-changed": true,
  "question-answered": true,
  "turn-finished": true,
  "api-retry": true,
  "api-error": true,
  "rate-limit-changed": true,
  "token-usage": true,
  "step-usage": true,
  "conversation-cleared": true,
  "session-ended": true,
  "model-changed": true,
  "model-effort-support": true,
  "effort-changed": true,
  "tasks-changed": true,
  "recommendation-changed": true,
  "welcome-greeting-changed": true,
  "sessions-changed": true,
  "chat-mode-changed": true,
  "chat-topics-changed": true,
  "remembered-lines-changed": true,
  "session-default-changed": true,
  "compact-boundary": true,
  "background-tasks-changed": true,
  "usage-review-stage": true,
  "usage-review-result": true,
  "usage-proposal-dismissed": true,
  "diary-written": true,
  "diary-requested": true,
  "diary-drafting": true,
  "diary-failed": true,
  "diary-stage": true,
  "character-changed": true,
} satisfies Record<SessionEvent["kind"], true>

/** `SessionEvent` の種類の名前か。 */
export function isSessionEventKind(value: unknown): value is SessionEvent["kind"] {
  return typeof value === "string" && Object.hasOwn(SESSION_EVENT_KINDS, value)
}
