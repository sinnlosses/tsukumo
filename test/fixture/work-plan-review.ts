import type { SessionEvent } from "../../src/shared/session/session-event.ts"
import { requestEvent } from "./session-event.ts"
import { checkedToolUseId } from "./tool-use-id.ts"

export const SUMMARY = "架空のまとめ。"

export const REQUEST = requestEvent()

export const handedBack = (delegate = "toolu_delegate"): SessionEvent => ({
  kind: "delegate-handed-back",
  delegate: checkedToolUseId(delegate),
})
