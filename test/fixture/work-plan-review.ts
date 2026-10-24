import type { SessionEvent } from "../../src/shared/session/session-event.ts"
import { requestEvent } from "./session-event.ts"

export const SUMMARY = "架空のまとめ。"

export const REQUEST = requestEvent()

export const handedBack = (delegate = "toolu_delegate"): SessionEvent => ({
  kind: "delegate-handed-back",
  delegate,
})
