// 体験の数を記録するときの判断（局面の移り変わりから何を1行にするか）と、書き口・読み口の契約。
//
// 見るのはイベントの種類と、畳んだあとの姿から導く局面（`conversationMoment`）だけ。
// 依頼の文面もセリフもツールの引数も、`ExperienceMetricEntry` に口が無いので通らない。

import type { ClosedMoment } from "../../../shared/experience-metric/experience-metric-record.ts"
import {
  type ConversationMoment,
  conversationMoment,
} from "../../../shared/session/conversation-moment.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { SessionState } from "../../../shared/session/session-state.ts"

/** 体験の数の読み書き口。書けなくても・読めなくても例外を投げない。 */
export type ExperienceMetricLog = {
  readonly append: (entry: ExperienceMetricEntry) => void
  /** 期間に入る行を古い→新しい順に返す。壊れた行・版が違う行は読まずに落とす。 */
  readonly readRange: (period: ExperienceMetricPeriod) => readonly ExperienceMetricEntry[]
}

/** 集計の対象にする期間。両端を含むローカル日付（`YYYY-MM-DD`）。 */
export type ExperienceMetricPeriod = {
  readonly startDate: string
  readonly endDate: string
}

/**
 * 記録の1件（書き出す行そのものではない）。
 * `at` はエポックミリ秒で、ISO 8601 への変換と日付ごとのファイルの選択は `adapter` 側の仕事。
 */
export type ExperienceMetricEntry = ConclusionEntry | RecoveryEntry

/** 依頼1つを送ってから、そのやり取りが閉じるまで。 */
export type ConclusionEntry = {
  readonly at: number
  readonly sessionId: string
  readonly kind: "conclusion"
  readonly moment: ClosedMoment
  readonly untilConclusionMs: number
  readonly askingMs: number
  readonly askCount: number
}

/** つまずいてから、次に依頼が `deliver` で閉じるまで。 */
export type RecoveryEntry = {
  readonly at: number
  readonly sessionId: string
  readonly kind: "recovery"
  readonly hands: number
  readonly untilRecoveryMs: number
}

/**
 * 局面の移り変わりを見て、閉じた依頼とつまずきからの立ち直りを記録へ1行ずつ渡す係。
 * 起こし直しをまたいで持つ（立ち直りまでの手数は、起こし直しをまたいで数えるため）。
 */
export type ExperienceMetricRecorder = {
  /** 駆動由来のイベント1件を畳んだあとに呼ぶ。`state` は畳んだあとの姿。復元の再生は渡さない。 */
  readonly observe: (event: SessionEvent, state: SessionState, at: number) => void
  /** 起こし直したときに呼ぶ。開いている依頼は行を書かずに捨て、立ち直り待ちなら1手と数える。 */
  readonly noteRestart: () => void
}

/** {@link ExperienceMetricRecorder} を1つ起こす。 */
export function createExperienceMetricRecorder(log: ExperienceMetricLog): ExperienceMetricRecorder {
  let tally: ExperienceTally = INITIAL_EXPERIENCE_TALLY

  return {
    observe: (event, state, at) => {
      const step = stepExperience(tally, event, state, at)
      tally = step.tally
      for (const entry of step.entries) {
        log.append(entry)
      }
    },
    noteRestart: () => {
      tally = {
        last: { kind: "unsynced" },
        exchange: { kind: "none" },
        recovery: countHand(tally.recovery),
      }
    },
  }
}

/**
 * 係が持ち回る勘定。
 *
 * - `last`: 前のイベントのあとの局面。起こした直後・起こし直した直後・雑談のあいだは、復元の再生で姿が飛ぶので `unsynced` にし、次のイベントでは移り変わりを数えずに合わせるだけにする
 * - `exchange`: いちばん新しい依頼が閉じるまでの勘定
 * - `recovery`: つまずいてから、次に依頼が `deliver` で閉じるまでの勘定
 */
type ExperienceTally = {
  readonly last:
    | { readonly kind: "unsynced" }
    | { readonly kind: "seen"; readonly moment: ConversationMoment }
  readonly exchange: { readonly kind: "none" } | OpenExchange
  readonly recovery: Recovery
}

type OpenExchange = {
  readonly kind: "open"
  readonly requestedAt: number
  readonly asking: { readonly kind: "idle" } | { readonly kind: "asking"; readonly since: number }
  readonly askingMs: number
  readonly askCount: number
}

type Recovery =
  | { readonly kind: "none" }
  | { readonly kind: "recovering"; readonly failedAt: number; readonly hands: number }

type ExperienceStep = {
  readonly tally: ExperienceTally
  readonly entries: readonly ExperienceMetricEntry[]
}

const INITIAL_EXPERIENCE_TALLY = {
  last: { kind: "unsynced" },
  exchange: { kind: "none" },
  recovery: { kind: "none" },
} satisfies ExperienceTally

/** イベント1件ぶん勘定を進め、書く行を返す。 */
function stepExperience(
  tally: ExperienceTally,
  event: SessionEvent,
  state: SessionState,
  at: number,
): ExperienceStep {
  if (state.chatMode) {
    return { tally: INITIAL_EXPERIENCE_TALLY, entries: [] }
  }
  const requested: ExperienceTally =
    event.kind === "request"
      ? {
          ...tally,
          exchange: {
            kind: "open",
            requestedAt: at,
            asking: { kind: "idle" },
            askingMs: 0,
            askCount: 0,
          },
          recovery: countHand(tally.recovery),
        }
      : tally
  const moment = conversationMoment(state)
  const seen: ExperienceTally = { ...requested, last: { kind: "seen", moment } }
  if (requested.last.kind === "unsynced") {
    return { tally: seen, entries: [] }
  }
  const exchange = followAsking(seen.exchange, moment, at)
  if (exchange.kind === "open" && (moment === "deliver" || moment === "stumble")) {
    return closeExchange(seen, exchange, moment, state, at)
  }
  const failedWhileIdle = moment === "stumble" && requested.last.moment !== "stumble"
  return {
    tally: {
      ...seen,
      exchange,
      recovery: failedWhileIdle ? startRecovery(seen.recovery, at) : seen.recovery,
    },
    entries: [],
  }
}

/** 立ち直り待ちのあいだなら、1手を足す。 */
function countHand(recovery: Recovery): Recovery {
  return recovery.kind === "recovering" ? { ...recovery, hands: recovery.hands + 1 } : recovery
}

/** つまずいた。すでに立ち直り待ちなら、最初につまずいた時刻のまま続ける。 */
function startRecovery(recovery: Recovery, at: number): Recovery {
  return recovery.kind === "recovering" ? recovery : { kind: "recovering", failedAt: at, hands: 0 }
}

/** 答え待ちに入った・出たを、開いている依頼の勘定に積む。重なったお伺いは1回と数える。 */
function followAsking(
  exchange: ExperienceTally["exchange"],
  moment: ConversationMoment,
  at: number,
): ExperienceTally["exchange"] {
  if (exchange.kind === "none") {
    return exchange
  }
  if (exchange.asking.kind === "idle" && moment === "ask") {
    return { ...exchange, asking: { kind: "asking", since: at }, askCount: exchange.askCount + 1 }
  }
  if (exchange.asking.kind === "asking" && moment !== "ask") {
    return {
      ...exchange,
      asking: { kind: "idle" },
      askingMs: exchange.askingMs + (at - exchange.asking.since),
    }
  }
  return exchange
}

/**
 * 開いていた依頼が閉じた。閉じた依頼を1行、`deliver` で閉じて立ち直り待ちだったら立ち直りも1行書く。
 * セッションIDが分からないうちは、勘定だけ進めて行は書かない。
 */
function closeExchange(
  tally: ExperienceTally,
  exchange: OpenExchange,
  moment: ClosedMoment,
  state: SessionState,
  at: number,
): ExperienceStep {
  const recovery = tally.recovery
  const recovered = moment === "deliver" && recovery.kind === "recovering"
  const nextTally: ExperienceTally = {
    ...tally,
    exchange: { kind: "none" },
    recovery: recovered
      ? { kind: "none" }
      : moment === "stumble"
        ? startRecovery(recovery, at)
        : recovery,
  }
  if (state.session.kind === "starting") {
    return { tally: nextTally, entries: [] }
  }
  const sessionId = state.session.sessionId
  const conclusion: ConclusionEntry = {
    at,
    sessionId,
    kind: "conclusion",
    moment,
    untilConclusionMs: at - exchange.requestedAt,
    askingMs: exchange.askingMs,
    askCount: exchange.askCount,
  }
  const recoveries: readonly RecoveryEntry[] =
    recovered && recovery.kind === "recovering"
      ? [
          {
            at,
            sessionId,
            kind: "recovery",
            hands: recovery.hands,
            untilRecoveryMs: at - recovery.failedAt,
          },
        ]
      : []
  return { tally: nextTally, entries: [conclusion, ...recoveries] }
}
