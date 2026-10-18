import type { SessionEvent } from "../../src/shared/session/session-event.ts"

export const SUMMARY = "架空のまとめ。"

export const REQUEST: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }

export const handedBack = (delegate = "toolu_delegate"): SessionEvent => ({
  kind: "delegate-handed-back",
  delegate,
})
