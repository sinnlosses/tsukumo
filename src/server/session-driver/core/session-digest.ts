// セッション1件の中身（依頼の数・要約・最後のセリフ）を transcript のメッセージ列から組む。SDK を呼ばない純粋な部分。
//
// 復元（`toRestoredEvents`）が組む履歴を数えた結果と同じになるよう、メッセージ列を1回なめて畳む。
// 差し戻された `speak` のセリフと、差し戻された `report` の要約・締めのセリフは拾わない。
// 読んだものはどこにも書き出さない。

import type { Expression } from "../../../shared/character-pack/expression.ts"
import {
  MAX_SESSION_SUMMARY_LENGTH,
  type SessionDigest,
  UNAVAILABLE_SESSION_DIGEST,
} from "../../../shared/session/session-digest.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { clipText } from "../../../shared/utils/clip-text.ts"
import { restoredMessageEvents } from "./session-restore.ts"

/** transcript のメッセージ列を、セッション1件の中身にする。列でなければ読めなかったものとして扱う。 */
export function toSessionDigest(
  messages: unknown,
  expressions: readonly Expression[],
): SessionDigest {
  if (!Array.isArray(messages)) {
    return UNAVAILABLE_SESSION_DIGEST
  }

  const folded = messages.reduce<DigestFold>(
    (fold, message) => restoredMessageEvents(message, expressions).reduce(foldEvent, fold),
    INITIAL_FOLD,
  )
  const { summary, lastLine } = folded.turnOpen ? adoptHeld(folded) : folded
  return {
    kind: "known",
    requestCount: folded.requestCount,
    summary: summary === undefined ? undefined : truncateSummary(summary.trim()),
    lastLine,
  }
}

type HeldCall = Extract<SessionEvent, { readonly kind: "report" | "speak-called" }>

/** 畳んでいる途中の姿。`held` は結果（`tool-finished`）をまだ受け取っていない `report` と `speak` の呼び出し。 */
type DigestFold = {
  readonly requestCount: number
  readonly summary: string | undefined
  readonly lastLine: string | undefined
  readonly held: readonly HeldCall[]
  readonly turnOpen: boolean
}

const INITIAL_FOLD: DigestFold = {
  requestCount: 0,
  summary: undefined,
  lastLine: undefined,
  held: [],
  turnOpen: false,
}

function foldEvent(fold: DigestFold, event: SessionEvent): DigestFold {
  switch (event.kind) {
    case "request":
      return {
        ...(fold.turnOpen ? adoptHeld(fold) : fold),
        requestCount: fold.requestCount + 1,
        turnOpen: true,
      }
    // 脇の話と続きのターンは依頼に数えず、ターンの区切りだけを畳む。
    case "aside":
    case "turn-resumed":
      return { ...(fold.turnOpen ? adoptHeld(fold) : fold), turnOpen: true }
    case "report":
    case "speak-called":
      return { ...fold, held: [...fold.held, event] }
    case "tool-finished": {
      const call = fold.held.find((candidate) => candidate.toolUseId === event.toolUseId)
      if (call === undefined) {
        return fold
      }
      const rest = { ...fold, held: fold.held.filter((candidate) => candidate !== call) }
      return event.isError ? rest : adoptCall(rest, call)
    }
    case "turn-finished":
      return adoptHeld(fold)
    case "speech":
      return { ...fold, lastLine: event.text }
    default:
      return fold
  }
}

/** 預かっていた呼び出しを、並びの順に取り込む。 */
function adoptHeld(fold: DigestFold): DigestFold {
  return fold.held.reduce(adoptCall, { ...fold, held: [] })
}

function adoptCall(fold: DigestFold, call: HeldCall): DigestFold {
  if (call.kind === "speak-called") {
    return { ...fold, lastLine: call.speech.text }
  }
  return {
    ...fold,
    summary: call.sessionSummary ?? fold.summary,
    lastLine: call.closing.kind === "speech" ? call.closing.text : fold.lastLine,
  }
}

function truncateSummary(summary: string): string {
  const { head, omittedLength } = clipText(summary, MAX_SESSION_SUMMARY_LENGTH)
  return omittedLength > 0 ? `${head}…` : head
}
