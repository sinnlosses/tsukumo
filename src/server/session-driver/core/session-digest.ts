// セッション1件の中身（依頼の数・要約・最後のセリフ）を transcript のメッセージ列から組む。SDK を呼ばない純粋な部分。
//
// 復元（`toRestoredEvents`）が組む履歴を数えた結果と同じになるよう、メッセージ列を1回なめて畳む。
// 差し戻された `report` の要約・締めのセリフは拾わない。
// 読んだものはどこにも書き出さない。

import type { Expression } from "../../../shared/character-pack/expression.ts"
import {
  MAX_SESSION_SUMMARY_LENGTH,
  type SessionDigest,
  UNAVAILABLE_SESSION_DIGEST,
} from "../../../shared/session/session-digest.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
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

type ReportEvent = Extract<SessionEvent, { readonly kind: "report" }>

/** 畳んでいる途中の姿。`held` は結果（`tool-finished`）をまだ受け取っていない `report`。 */
type DigestFold = {
  readonly requestCount: number
  readonly summary: string | undefined
  readonly lastLine: string | undefined
  readonly held: readonly ReportEvent[]
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
    case "report":
      return { ...fold, held: [...fold.held, event] }
    case "tool-finished": {
      const report = fold.held.find((candidate) => candidate.toolUseId === event.toolUseId)
      if (report === undefined) {
        return fold
      }
      const rest = { ...fold, held: fold.held.filter((candidate) => candidate !== report) }
      return event.isError ? rest : adoptReport(rest, report)
    }
    case "turn-finished":
      return adoptHeld(fold)
    case "speech":
      return { ...fold, lastLine: event.text }
    default:
      return fold
  }
}

/** 預かっていた `report` を、並びの順に取り込む。 */
function adoptHeld(fold: DigestFold): DigestFold {
  return fold.held.reduce(adoptReport, { ...fold, held: [] })
}

function adoptReport(fold: DigestFold, report: ReportEvent): DigestFold {
  return {
    ...fold,
    summary: report.sessionSummary ?? fold.summary,
    lastLine: report.closing.kind === "speech" ? report.closing.text : fold.lastLine,
  }
}

function truncateSummary(summary: string): string {
  return summary.length <= MAX_SESSION_SUMMARY_LENGTH
    ? summary
    : `${summary.slice(0, MAX_SESSION_SUMMARY_LENGTH)}…`
}
