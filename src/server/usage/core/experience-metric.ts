// 進行の計測値を記録するときの判断（局面の移り変わりから何を1行にするか）と、書き口・読み口の契約。
//
// 見るのはイベントの種類と、畳んだあとの姿から導く局面（`conversationMoment`）だけ。
// 依頼の文面もセリフもツールの引数も、`ExperienceMetricEntry` に口が無いので通らない。

import { sumBy } from "remeda"

import type { ReportBlock } from "../../../shared/report/report-block.ts"
import {
  type ConversationMoment,
  conversationMoment,
} from "../../../shared/session/conversation-moment.ts"
import { mainViewEntries } from "../../../shared/session/main-view-entry.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { SessionState } from "../../../shared/session/session-state.ts"
import type { ClosedMoment, SplitDivider } from "../../../shared/usage/experience-metric-record.ts"

/** 進行の計測値の読み書き口。書けなくても・読めなくても例外を投げない。 */
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
export type ExperienceMetricEntry = ConclusionEntry | RecoveryEntry | SplitEntry | ReadingEntry

/** 最終レポートで閉じてから、次の依頼を送るまで。`at` は次の依頼の時刻。 */
export type ReadingEntry = {
  readonly at: number
  readonly sessionId: string
  readonly kind: "reading"
  readonly readingSeconds: number
  readonly bodyChars: number
  readonly tableRate: number
  readonly hasDiagram: boolean
}

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

/** 仕切りを離した1回。 */
export type SplitEntry = {
  readonly at: number
  readonly sessionId: string
  readonly kind: "split"
  readonly divider: SplitDivider
  readonly releasedPercent: number
  readonly previousPercent: number
}

/** 仕切りを離したときの入力（時刻とセッションIDは含まない）。 */
export type SplitRelease = {
  readonly divider: SplitDivider
  readonly releasedPercent: number
  readonly previousPercent: number
}

/** 仕切りを離した1回を、記録の1件に組む。 */
export function splitEntry(release: SplitRelease, sessionId: string, at: number): SplitEntry {
  return {
    at,
    sessionId,
    kind: "split",
    divider: release.divider,
    releasedPercent: release.releasedPercent,
    previousPercent: release.previousPercent,
  }
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
  let reading: PendingReading = { kind: "none" }

  return {
    observe: (event, state, at) => {
      const step = stepExperience(tally, event, state, at)
      tally = step.tally
      const readStep = stepReading(reading, event, state, at, step.entries)
      reading = readStep.reading
      for (const entry of [...readStep.entries, ...step.entries]) {
        log.append(entry)
      }
    },
    noteRestart: () => {
      reading = { kind: "none" }
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

/**
 * 最終レポートで閉じてから、次の依頼を待っている勘定。
 * サーバは描画の完了を知らないので、閉じた時刻（`deliver` の行を書く時刻）を読み始めとする。
 */
type PendingReading =
  | { readonly kind: "none" }
  | {
      readonly kind: "pending"
      readonly closedAt: number
      readonly sessionId: string
      readonly shape: ReadingShape
    }

type ReadingShape = {
  readonly bodyChars: number
  readonly tableRate: number
  readonly hasDiagram: boolean
}

const DIAGRAM_BLOCK_KINDS: ReadonlySet<ReportBlock["kind"]> = new Set<ReportBlock["kind"]>([
  "mermaid",
  "graph",
  "chart",
  "svg",
  "timeline",
  "beforeAfter",
  "image",
])

/** 次の依頼で読む時間の行を書き、`deliver` で閉じたら次の勘定を始める（`stumble` で閉じたら捨てる）。雑談のあいだは持たない。 */
function stepReading(
  reading: PendingReading,
  event: SessionEvent,
  state: SessionState,
  at: number,
  closed: readonly ExperienceMetricEntry[],
): { readonly reading: PendingReading; readonly entries: readonly ReadingEntry[] } {
  if (state.chatMode) {
    return { reading: { kind: "none" }, entries: [] }
  }
  const entries: readonly ReadingEntry[] =
    event.kind === "request" && reading.kind === "pending"
      ? [
          {
            at,
            sessionId: reading.sessionId,
            kind: "reading",
            readingSeconds: (at - reading.closedAt) / 1000,
            ...reading.shape,
          },
        ]
      : []
  const afterRequest: PendingReading = event.kind === "request" ? { kind: "none" } : reading
  const conclusion = closed.find((entry) => entry.kind === "conclusion")
  if (conclusion === undefined) {
    return { reading: afterRequest, entries }
  }
  return {
    reading:
      conclusion.moment === "deliver"
        ? {
            kind: "pending",
            closedAt: at,
            sessionId: conclusion.sessionId,
            shape: readingShapeOf(state),
          }
        : { kind: "none" },
    entries,
  }
}

/** いちばん新しい `report` の記録から、字数・表の割合・図の有無だけを取る。本文は持ち出さない。 */
function readingShapeOf(state: SessionState): ReadingShape {
  const report = state.records.findLast((record) => record.kind === "report")
  if (report === undefined) {
    return { bodyChars: 0, tableRate: 0, hasDiagram: false }
  }
  const blocks = report.sections.flatMap((section) => section.blocks)
  const shownReport = mainViewEntries(state)
    .filter((entry) => entry.kind === "report")
    .at(-1)
  return {
    bodyChars:
      shownReport === undefined
        ? 0
        : sumBy(shownReport.regions.sections, (section) => section.markdown.length),
    tableRate:
      blocks.length === 0
        ? 0
        : blocks.filter((block) => block.kind === "table").length / blocks.length,
    hasDiagram:
      report.figure.kind !== "none" || blocks.some((block) => DIAGRAM_BLOCK_KINDS.has(block.kind)),
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
