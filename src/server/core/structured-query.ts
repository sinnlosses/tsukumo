// 出力の形（JSON Schema）つきの使い捨ての問い合わせ1回に渡すものと、
// 締め切りの中で1回走らせる手順・最大2回走らせて先に書けたほうを使う手順。
// 答えの検査は呼ぶ側が渡し、足跡に要る所要と各回の結果も一緒に返す。

import type { PromptImageSource } from "../../shared/session-driver/prompt-image.ts"
import type { ThrowawayQueryKind } from "./throwaway-query.ts"

/** `query()` に渡すもの（記録の種類・モデル・指示文・依頼の文面・添える画像・出力の形）。 */
export type StructuredQuery = {
  readonly kind: ThrowawayQueryKind
  readonly model: string
  /** `query()` の `systemPrompt` をそのまま置き換える指示文。 */
  readonly systemPrompt: string
  readonly prompt: string
  /** 依頼の文面の前に添える画像（無ければ空）。 */
  readonly images: readonly PromptImageSource[]
  readonly schema: Readonly<Record<string, unknown>>
}

/** `query()` の result が成功でなかったときに口が投げる。`subtype` は SDK の語のまま持つ。 */
export class StructuredQueryResultError extends Error {
  readonly subtype: string

  constructor(subtype: string) {
    super(`形つきの問い合わせが通らなかった（${subtype}）`)
    this.name = "StructuredQueryResultError"
    this.subtype = subtype
  }
}

/** 答えを検査した結果。落ちたときは理由の語 `R` を持つ。 */
export type CheckedAnswer<T, R> =
  | { readonly kind: "accepted"; readonly value: T }
  | { readonly kind: "rejected"; readonly reason: R }

export type RetriedQueryPorts = {
  /** 問い合わせを1回走らせ、`structured_output` をそのまま返す。失敗・中断では reject する。 */
  readonly query: (request: StructuredQuery, signal: AbortSignal) => Promise<unknown>
  /** 現在時刻（エポックミリ秒）。 */
  readonly now: () => number
}

/** 問い合わせ1回の結果と所要。検査に落ちた回だけ理由を持つ。`superseded` は先に書けた別の回に負けて中断した回。 */
export type RetriedAttemptTrace<R> =
  | { readonly result: "rejected"; readonly reason: R; readonly ms: number }
  | { readonly result: "written" | "failed" | "timed-out" | "superseded"; readonly ms: number }

/** 書き込み全体の所要と、起こした順の各回の結果。 */
export type RetriedQueryTrace<R> = {
  readonly durationMs: number
  readonly attempts: readonly RetriedAttemptTrace<R>[]
}

/**
 * 問い合わせの結果。`aborted` は外から渡した `signal` で中断したとき（足跡を残さない）。
 * それ以外は結果に使った回で、`failed` だけが問い合わせの失敗の実物を持つ。
 */
export type RetriedQueryOutcome<T, R> =
  | { readonly kind: "aborted" }
  | { readonly kind: "written"; readonly value: T; readonly trace: RetriedQueryTrace<R> }
  | { readonly kind: "failed"; readonly error: unknown; readonly trace: RetriedQueryTrace<R> }
  | { readonly kind: "rejected" | "timed-out"; readonly trace: RetriedQueryTrace<R> }

type Attempt<T, R> =
  | { readonly kind: "written"; readonly value: T; readonly ms: number }
  | { readonly kind: "failed"; readonly error: unknown; readonly ms: number }
  | { readonly kind: "rejected"; readonly reason: R; readonly ms: number }
  | { readonly kind: "timed-out"; readonly ms: number }
  | { readonly kind: "superseded"; readonly ms: number }

type RunningAttempt<T, R> = {
  readonly promise: Promise<Attempt<T, R>>
  /** この回を中断する。中断の後始末は待たず、そこまでの所要で `superseded` を返す。 */
  readonly supersede: () => Attempt<T, R>
}

/** 起こした順の各回（`all`）と、結果に使う回（`used`）。 */
type RacedAttempts<T, R> = {
  readonly all: readonly Attempt<T, R>[]
  readonly used: Attempt<T, R>
}

/**
 * `run` を `signal` と `timeoutMs` の締め切りを束ねた中断の口で走らせる。
 * どちらかが来たら `run` の終わりを待たずに `aborted` で返る（`run` が中断を無視しても待たない）。
 */
export function runWithDeadline<T>(
  signal: AbortSignal,
  timeoutMs: number,
  run: (bounded: AbortSignal) => Promise<T>,
  aborted: T,
): Promise<T> {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
  return Promise.race([run(bounded), abortion(bounded, aborted)])
}

/**
 * 1回目が書けずに終われば、すぐ2回目を起こす。1回目が `hedgeAfterMs` 経っても返らないときは、
 * 1回目を止めずに2回目を並べて起こし、先に書けたほうを使う（負けたほうは中断し、結果を待たない）。
 * `signal` も `timeoutMs` の締め切りも来ていれば、2回目は起こさない。
 * 締め切りが来て問い合わせが reject した回は `timed-out`。
 */
export async function runRetriedQuery<T, R>(
  ports: RetriedQueryPorts,
  request: StructuredQuery,
  check: (answer: unknown) => CheckedAnswer<T, R>,
  signal: AbortSignal,
  timeoutMs: number,
  hedgeAfterMs: number,
): Promise<RetriedQueryOutcome<T, R>> {
  const startedAt = ports.now()
  const deadline = AbortSignal.timeout(timeoutMs)
  const bounded = AbortSignal.any([signal, deadline])

  const launch = (): RunningAttempt<T, R> => {
    const attemptStartedAt = ports.now()
    const elapsed = (): number => ports.now() - attemptStartedAt
    const own = new AbortController()
    const attemptSignal = AbortSignal.any([bounded, own.signal])
    const promise = (async (): Promise<Attempt<T, R>> => {
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

async function raceAttempts<T, R>(
  launch: () => RunningAttempt<T, R>,
  bounded: AbortSignal,
  hedgeAfterMs: number,
): Promise<RacedAttempts<T, R>> {
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
function firstWritten<T, R>(
  first: Promise<Attempt<T, R>>,
  second: Promise<Attempt<T, R>>,
): Promise<{ readonly index: 0 | 1; readonly attempt: Attempt<T, R> } | undefined> {
  return new Promise((resolve) => {
    let pending = 2
    const watch = (promise: Promise<Attempt<T, R>>, index: 0 | 1): void => {
      const settle = (attempt: Attempt<T, R> | undefined): void => {
        if (attempt?.kind === "written") {
          resolve({ index, attempt })
          return
        }
        pending -= 1
        if (pending === 0) {
          resolve(undefined)
        }
      }
      promise.then(settle, () => {
        settle(undefined)
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
  let cancel: () => void = noCancel
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

function noCancel(): void {}

/** `signal` が中断されたら `aborted` で解く。 */
function abortion<T>(signal: AbortSignal, aborted: T): Promise<T> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(aborted)
      return
    }
    signal.addEventListener(
      "abort",
      () => {
        resolve(aborted)
      },
      { once: true },
    )
  })
}

function attemptTraceOf<T, R>(attempt: Attempt<T, R>): RetriedAttemptTrace<R> {
  return attempt.kind === "rejected"
    ? { result: "rejected", reason: attempt.reason, ms: attempt.ms }
    : { result: attempt.kind, ms: attempt.ms }
}
