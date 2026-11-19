// 話しかける間合い。待ちの一言を出すまでの間と、進み具合の催促を差し込むまでの黙りの間。

/** 待ちの一言を、ターンが閉じてから出すまでの間。 */
export const WAITING_LINE_DELAYS = ["1m", "2m", "5m", "off"] as const

/** 進み具合の催促を、最後のセリフから黙ってから差し込むまでの間。 */
export const PROGRESS_NUDGE_SILENCES = ["3m", "5m", "10m", "off"] as const

type WaitingLineDelay = (typeof WAITING_LINE_DELAYS)[number]
export type ProgressNudgeSilence = (typeof PROGRESS_NUDGE_SILENCES)[number]

export type SpeakingPace = {
  readonly waitingLine: WaitingLineDelay
  readonly progressNudge: ProgressNudgeSilence
}

/** 同梱の既定。覚えた値が無い・読めない・知らない値の欄だけ、ここへ畳む。 */
export const BUILTIN_SPEAKING_PACE = {
  waitingLine: "2m",
  progressNudge: "5m",
} satisfies SpeakingPace

/**
 * 状態に載せる間合い。
 * `remembered` は歯車が出す覚えた値で、歯車で覚え直すたびに変わる。
 * `launchedWaitingLine` はこのセッションを起こしたときに読んだ待ちの一言の間で、覚え直しても変わらない（動いているセッションの時刻を変えないため）。
 */
export type SpeakingPaceState = {
  readonly remembered: SpeakingPace
  readonly launchedWaitingLine: WaitingLineDelay
}

export const INITIAL_SPEAKING_PACE_STATE = {
  remembered: BUILTIN_SPEAKING_PACE,
  launchedWaitingLine: BUILTIN_SPEAKING_PACE.waitingLine,
} satisfies SpeakingPaceState

const WAITING_LINE_DELAY_MS = {
  "1m": 60_000,
  "2m": 120_000,
  "5m": 300_000,
} satisfies Record<Exclude<WaitingLineDelay, "off">, number>

/** 外から届いた文字列が、待ちの一言の間として選べる値かどうか。 */
export function isWaitingLineDelay(value: string): value is WaitingLineDelay {
  return WAITING_LINE_DELAYS.some((delay) => delay === value)
}

/** 外から届いた文字列が、進み具合の催促の黙りの間として選べる値かどうか。 */
export function isProgressNudgeSilence(value: string): value is ProgressNudgeSilence {
  return PROGRESS_NUDGE_SILENCES.some((silence) => silence === value)
}

const PROGRESS_NUDGE_SILENCE_MS = {
  "3m": 180_000,
  "5m": 300_000,
  "10m": 600_000,
} satisfies Record<Exclude<ProgressNudgeSilence, "off">, number>

/** 進み具合の催促を差し込むまでの黙りの間のミリ秒。「しない」は undefined。 */
export function progressNudgeSilenceMs(silence: ProgressNudgeSilence) {
  return silence === "off" ? undefined : PROGRESS_NUDGE_SILENCE_MS[silence]
}

/** 待ちの一言を出すまでの間のミリ秒。「出さない」は undefined。 */
export function waitingLineDelayMs(delay: WaitingLineDelay) {
  return delay === "off" ? undefined : WAITING_LINE_DELAY_MS[delay]
}
