// 使い捨ての問い合わせを、締め切りの中で1回だけ問い合わせ直して走らせる。
// 答えの検査は呼ぶ側が渡し、足跡に要る所要と各回の結果も一緒に返す。

import type {
  WelcomeAttemptTrace,
  WelcomeRejection,
  WelcomeWritingFootprint,
} from "../../../shared/diagnostic/welcome-writing.ts"
import type { StructuredQuery } from "./structured-query.ts"

/** 答えを検査した結果。落ちたときは理由の語を持つ。 */
export type CheckedAnswer<T> =
  | { readonly kind: "accepted"; readonly value: T }
  | { readonly kind: "rejected"; readonly reason: WelcomeRejection }

export type RetriedQueryPorts = {
  /** 問い合わせを1回走らせ、`structured_output` をそのまま返す。失敗・中断では reject する。 */
  readonly query: (request: StructuredQuery, signal: AbortSignal) => Promise<unknown>
  /** 現在時刻（エポックミリ秒）。 */
  readonly now: () => number
}

/** 書き込み全体の所要と各回の結果。 */
export type RetriedQueryTrace = Pick<WelcomeWritingFootprint, "durationMs" | "attempts">

/**
 * 問い合わせの結果。`aborted` は外から渡した `signal` で中断したとき（足跡を残さない）。
 * それ以外は最後の回の結果で、`failed` だけが問い合わせの失敗の実物を持つ。
 */
export type RetriedQueryOutcome<T> =
  | { readonly kind: "aborted" }
  | { readonly kind: "written"; readonly value: T; readonly trace: RetriedQueryTrace }
  | { readonly kind: "failed"; readonly error: unknown; readonly trace: RetriedQueryTrace }
  | { readonly kind: "rejected" | "timed-out"; readonly trace: RetriedQueryTrace }

type Attempt<T> =
  | { readonly kind: "written"; readonly value: T; readonly ms: number }
  | { readonly kind: "failed"; readonly error: unknown; readonly ms: number }
  | { readonly kind: "rejected"; readonly reason: WelcomeRejection; readonly ms: number }
  | { readonly kind: "timed-out"; readonly ms: number }

/**
 * 1回目が書けず、`signal` も `timeoutMs` の締め切りもまだ来ていなければ1回だけ問い合わせ直す。
 * 締め切りが来て問い合わせが reject した回は `timed-out`。
 */
export async function runRetriedQuery<T>(
  ports: RetriedQueryPorts,
  request: StructuredQuery,
  check: (answer: unknown) => CheckedAnswer<T>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<RetriedQueryOutcome<T>> {
  const startedAt = ports.now()
  const deadline = AbortSignal.timeout(timeoutMs)
  const bounded = AbortSignal.any([signal, deadline])

  const attempt = async (): Promise<Attempt<T>> => {
    const attemptStartedAt = ports.now()
    const elapsed = (): number => ports.now() - attemptStartedAt
    let answer: unknown = undefined
    try {
      answer = await ports.query(request, bounded)
    } catch (error) {
      return deadline.aborted && !signal.aborted
        ? { kind: "timed-out", ms: elapsed() }
        : { kind: "failed", error, ms: elapsed() }
    }
    const checked = check(answer)
    return checked.kind === "accepted"
      ? { kind: "written", value: checked.value, ms: elapsed() }
      : { kind: "rejected", reason: checked.reason, ms: elapsed() }
  }

  const first = await attempt()
  const last = first.kind !== "written" && !bounded.aborted ? await attempt() : first

  if (signal.aborted) {
    return { kind: "aborted" }
  }
  const trace = {
    durationMs: ports.now() - startedAt,
    attempts: (last === first ? [first] : [first, last]).map(attemptTraceOf),
  }
  switch (last.kind) {
    case "written":
      return { kind: "written", value: last.value, trace }
    case "failed":
      return { kind: "failed", error: last.error, trace }
    case "rejected":
    case "timed-out":
      return { kind: last.kind, trace }
  }
}

function attemptTraceOf<T>(attempt: Attempt<T>): WelcomeAttemptTrace {
  return attempt.kind === "rejected"
    ? { result: "rejected", reason: attempt.reason, ms: attempt.ms }
    : { result: attempt.kind, ms: attempt.ms }
}
