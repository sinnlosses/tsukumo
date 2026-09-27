// セッション1件の中身（依頼の数・要約・最後のセリフ）を transcript のメッセージ列から組む
// （`docs/glossary.md`「セッションの要約」）。SDK を呼ばない純粋な部分で、読むのは SDK を起こすアダプタ。
//
// 組み方は復元（`toRestoredEvents`）と同じ変換を通す。差し戻された `report` の要約・締めのセリフを
// 拾わないためで、画面が復元で見せるものと数が揃う。読んだものはどこにも書き出さない
// （docs/coding-standards.md「会話内容の扱い」）。

import type { Expression } from "../../../shared/expression.ts"
import {
  MAX_SESSION_SUMMARY_LENGTH,
  type SessionDigest,
  UNAVAILABLE_SESSION_DIGEST,
} from "../../../shared/session-digest.ts"
import { toRestoredEvents } from "./session-restore.ts"

/** transcript のメッセージ列を、セッション1件の中身にする。列でなければ読めなかったものとして扱う。 */
export function toSessionDigest(
  messages: unknown,
  expressions: readonly Expression[],
): SessionDigest {
  if (!Array.isArray(messages)) {
    return UNAVAILABLE_SESSION_DIGEST
  }

  const events = toRestoredEvents(messages, expressions)
  const summary = events
    .flatMap((event) =>
      event.kind === "report" && event.sessionSummary !== undefined ? [event.sessionSummary] : [],
    )
    .at(-1)
  return {
    kind: "known",
    requestCount: events.filter((event) => event.kind === "request").length,
    summary: summary === undefined ? undefined : truncateSummary(summary.trim()),
    lastLine: events.flatMap((event) => (event.kind === "speech" ? [event.text] : [])).at(-1),
  }
}

function truncateSummary(summary: string): string {
  return summary.length <= MAX_SESSION_SUMMARY_LENGTH
    ? summary
    : `${summary.slice(0, MAX_SESSION_SUMMARY_LENGTH)}…`
}
