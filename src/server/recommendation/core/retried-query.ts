// 使い捨ての問い合わせを、締め切りの中で最大2回、先に書けたほうを使って走らせる。
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
 * それ以外は結果に使った回で、`failed` だけが問い合わせの失敗の実物を持つ。
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
  | { readonly kind: "superseded"; readonly ms: number }

type RunningAttempt<T> = {
  readonly promise: Promise<Attempt<T>>
  /** この回を中断する。中断の後始末は待たず、そこまでの所要で `superseded` を返す。 */
  readonly supersede: () => Attempt<T>
}

/** 起こした順の各回（`all`）と、結果に使う回（`used`）。 */
type RacedAttempts<T> = { readonly all: readonly Attempt<T>[]; readonly used: Attempt<T> }

/**
 * 1回目が書けずに終われば、すぐ2回目を起こす。1回目が `hedgeAfterMs` 経っても返らないときは、
 * 1回目を止めずに2回目を並べて起こし、先に書けたほうを使う（負けたほうは中断し、結果を待たない）。
 * `signal` も `timeoutMs` の締め切りも来ていれば、2回目は起こさない。
 * 締め切りが来て問い合わせが reject した回は `timed-out`。
 */
export async function runRetriedQuery<T>(
  ports: RetriedQueryPorts,
  request: StructuredQuery,
  check: (answer: unknown) => CheckedAnswer<T>,
  signal: AbortSignal,
  timeoutMs: number,
  hedgeAfterMs: number,
): Promise<RetriedQueryOutcome<T>> {
  const startedAt = ports.now()
  const deadline = AbortSignal.timeout(timeoutMs)
  const bounded = AbortSignal.any([signal, deadline])

  const launch = (): RunningAttempt<T> => {
    const attemptStartedAt = ports.now()
    const elapsed = (): number => ports.now() - attemptStartedAt
    const own = new AbortController()
    const attemptSignal = AbortSignal.any([bounded, own.signal])
    const promise = (async (): Promise<Attempt<T>> => {
      let answer: unknown = undefined
      try {
        answer = await ports.query(request, attemptSignal)
      } catch (error) {
        if (own.signal.aborted && !bounded.aborted) {
          return { kind: "superseded", ms: elapsed() }
        }
        return deadline.aborted && !signal.aborted
          ? { kind: "timed-out", ms: elapsed() }
          : { kind: "failed", error, ms: elapsed() }
      }
      const checked = check(answer)
      return checked.kind === "accepted"
        ? { kind: "written", value: checked.value, ms: elapsed() }
        : { kind: "rejected", reason: checked.reason, ms: elapsed() }
    })()
    return {
      promise,
      supersede: () => {
        own.abort()
        return { kind: "superseded", ms: elapsed() }
      },
    }
  }

  const raced = await raceAttempts(launch, bounded, hedgeAfterMs)

  if (signal.aborted) {
    return { kind: "aborted" }
  }
  const trace = {
    durationMs: ports.now() - startedAt,
    attempts: raced.all.map(attemptTraceOf),
  }
  const used = raced.used
  switch (used.kind) {
    case "written":
      return { kind: "written", value: used.value, trace }
    case "failed":
      return { kind: "failed", error: used.error, trace }
    case "rejected":
    case "timed-out":
      return { kind: used.kind, trace }
    case "superseded":
      // 結果に使う回は負けた側にならない。到達しない枝を締め切りの失敗として畳む。
      return { kind: "timed-out", trace }
  }
}

async function raceAttempts<T>(
  launch: () => RunningAttempt<T>,
  bounded: AbortSignal,
  hedgeAfterMs: number,
): Promise<RacedAttempts<T>> {
  const first = launch()
  const hedge = hedgeTimer(hedgeAfterMs, bounded)
  const early = await Promise.race([first.promise, hedge.promise])
  hedge.cancel()

  if (early?.kind === "written") {
    return { all: [early], used: early }
  }
  if (bounded.aborted) {
    const settled = early ?? (await first.promise)
    return { all: [settled], used: settled }
  }
  if (early !== undefined) {
    const second = await launch().promise
    return { all: [early, second], used: second }
  }

  const second = launch()
  const winner = await firstWritten(first.promise, second.promise)
  if (winner === undefined) {
    const [a, b] = await Promise.all([first.promise, second.promise])
    return { all: [a, b], used: b }
  }
  const loser = (winner.index === 0 ? second : first).supersede()
  return {
    all: winner.index === 0 ? [winner.attempt, loser] : [loser, winner.attempt],
    used: winner.attempt,
  }
}

/** 先に `written` になった回。2回とも書けずに終われば `undefined`。 */
function firstWritten<T>(
  first: Promise<Attempt<T>>,
  second: Promise<Attempt<T>>,
): Promise<{ readonly index: 0 | 1; readonly attempt: Attempt<T> } | undefined> {
  return new Promise((resolve) => {
    let pending = 2
    const watch = (promise: Promise<Attempt<T>>, index: 0 | 1): void => {
      void promise.then((attempt) => {
        if (attempt.kind === "written") {
          resolve({ index, attempt })
          return
        }
        pending -= 1
        if (pending === 0) {
          resolve(undefined)
        }
      })
    }
    watch(first, 0)
    watch(second, 1)
  })
}

/** `ms` 経つか `signal` が中断すると `undefined` で解く。`cancel` で後始末する。 */
function hedgeTimer(
  ms: number,
  signal: AbortSignal,
): { readonly promise: Promise<undefined>; readonly cancel: () => void } {
  let cancel = (): void => {}
  const promise = new Promise<undefined>((resolve) => {
    const done = (): void => {
      resolve(undefined)
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener("abort", done, { once: true })
    cancel = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", done)
    }
  })
  return { promise, cancel }
}

function attemptTraceOf<T>(attempt: Attempt<T>): WelcomeAttemptTrace {
  return attempt.kind === "rejected"
    ? { result: "rejected", reason: attempt.reason, ms: attempt.ms }
    : { result: attempt.kind, ms: attempt.ms }
}
