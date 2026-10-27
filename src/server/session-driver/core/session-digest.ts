// セッション1件の中身（依頼の数・要約・残り・最後のセリフ）を transcript のメッセージ列から組む。SDK を呼ばない純粋な部分。
//
// 復元（`toRestoredEvents`）が組む履歴を数えた結果と同じになるよう、メッセージ列を1回なめて畳む。
// 差し戻された `speak` のセリフと、差し戻された `report` の要約・締めのセリフは拾わない。
// 差し戻しのあとの出し直しで省いた欄は、復元と同じ `ReportInheritance` で埋めてから畳む。
// 要約は `sessionSummary` が一度も通っていないときだけ、直近5ターンの `conclusion` の1文目を箇条に並べて代わりにする
// （これは復元の履歴には無い、この畳みだけの組み立て）。
// 読んだものはどこにも書き出さない。

import type { Expression } from "../../../shared/character-pack/expression.ts"
import { foldInlineMarks } from "../../../shared/report/inline-mark.ts"
import {
  MAX_SESSION_SUMMARY_LENGTH,
  type SessionDigest,
  type SessionRemaining,
  summaryParagraphs,
  UNAVAILABLE_SESSION_DIGEST,
} from "../../../shared/session/session-digest.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { clipWithEllipsis } from "../../../shared/utils/clip-text.ts"
import { createReportInheritance } from "../../report/core/report-inheritance.ts"
import { EMPTY_INPUT_LEDGER } from "./input-ledger.ts"
import { restoredMessageEvents } from "./session-restore.ts"

/** transcript のメッセージ列を、セッション1件の中身にする。列でなければ読めなかったものとして扱う。 */
export function toSessionDigest(
  messages: unknown,
  expressions: readonly Expression[],
): SessionDigest {
  if (!Array.isArray(messages)) {
    return UNAVAILABLE_SESSION_DIGEST
  }

  const reportInheritance = createReportInheritance()
  const folded = messages.reduce<DigestFold>(
    (fold, message) =>
      restoredMessageEvents(message, expressions, EMPTY_INPUT_LEDGER)
        .map((event) => reportInheritance.pass(event))
        .reduce(foldEvent, fold),
    INITIAL_FOLD,
  )
  const { summary, remaining, lastLine, conclusions } = folded.turnOpen ? adoptHeld(folded) : folded
  const split =
    remaining.kind === "unrecorded" && summary !== undefined
      ? splitLegacyRemaining(summary)
      : { summary, remaining: remaining.kind === "remaining" ? remaining.text : undefined }
  return {
    kind: "known",
    requestCount: folded.requestCount,
    summary: clipped(split.summary) ?? clipped(conclusionBullets(conclusions)),
    remaining: clipped(split.remaining),
    lastLine,
  }
}

/** `sessionSummary` が一度も書かれていないときに、要約の代わりに並べる結論の数（新しいほう）。 */
const RECENT_CONCLUSION_COUNT = 5

function conclusionBullets(conclusions: readonly string[]): string | undefined {
  return conclusions.length === 0
    ? undefined
    : conclusions.map((conclusion) => `- ${conclusion}`).join("\n")
}

/** `sessionRemaining` の無かった頃の要約で、残りの段落の書き出し。 */
const LEGACY_REMAINING_PREFIX = "残り"

/**
 * `sessionRemaining` の無かった頃の要約から、段落の頭が「残り」の段落を残りとして取り出し、要約から外す。
 * 段落の途中の「残り：」は拾わない。書き出しを外して中身が空なら、残りは undefined（段落は外す）。
 */
function splitLegacyRemaining(summary: string): {
  readonly summary: string
  readonly remaining: string | undefined
} {
  const paragraphs = summaryParagraphs(summary)
  const found = paragraphs.find((line) => line.startsWith(LEGACY_REMAINING_PREFIX))
  if (found === undefined) {
    return { summary, remaining: undefined }
  }
  const rest = found
    .slice(LEGACY_REMAINING_PREFIX.length)
    .replace(/^[:：]\s*/, "")
    .trim()
  return {
    summary: paragraphs.filter((line) => line !== found).join("\n\n"),
    remaining: rest === "" ? undefined : rest,
  }
}

function clipped(text: string | undefined): string | undefined {
  const trimmed = text?.trim()
  return trimmed === undefined || trimmed === ""
    ? undefined
    : clipWithEllipsis(trimmed, MAX_SESSION_SUMMARY_LENGTH)
}

type HeldCall = Extract<SessionEvent, { readonly kind: "report" | "speak-called" }>

/** 畳んでいる途中の姿。`held` は結果（`tool-finished`）をまだ受け取っていない `report` と `speak` の呼び出し。 */
type DigestFold = {
  readonly requestCount: number
  readonly summary: string | undefined
  /** 最後に取り込んだ `report` の残り。`report` がまだ無ければ `none`。 */
  readonly remaining: SessionRemaining
  readonly lastLine: string | undefined
  /** 通った `report` の結論の1文目。古い順で、直近 {@link RECENT_CONCLUSION_COUNT} 件。 */
  readonly conclusions: readonly string[]
  readonly held: readonly HeldCall[]
  readonly turnOpen: boolean
}

const INITIAL_FOLD: DigestFold = {
  requestCount: 0,
  summary: undefined,
  remaining: { kind: "none" },
  lastLine: undefined,
  conclusions: [],
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
    remaining: call.sessionRemaining,
    conclusions: [
      ...fold.conclusions,
      ...(call.conclusionFirstSentence.trim() === ""
        ? []
        : [foldInlineMarks(call.conclusionFirstSentence.trim())]),
    ].slice(-RECENT_CONCLUSION_COUNT),
    lastLine: call.closing.kind === "speech" ? call.closing.text : fold.lastLine,
  }
}
