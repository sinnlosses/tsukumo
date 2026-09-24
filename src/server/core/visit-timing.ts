// 訪問の出入りと台本の進みの判断（`docs/design.md` 5章「訪問の契機と状態」）。**純関数だけ**で、
// 時計は持たない。時刻は呼び出し側（`visit-watch.ts`）が渡し、時計を回すのは adapter
// （`src/server/adapter/visit-clock.ts`）。
//
// 待っている、と言える信号は2つ（`docs/requirements.md` 2.2・4.3、提案は
// `docs/research/character-visit.md` 論点1）:
//
// - A. 背景のタスクだけが動いている: ターンが終わっていて、`backgroundTasks` が1件以上
// - B. ツールが走りっぱなし: ターンの中で、いまのやり取りのトップレベルのツールに結果がまだ無い
//
// 答え待ち（待たせているのが利用者）と雑談モード（往復そのものが会話）は待ちに数えない。

import { type SessionEvent } from "../../shared/session-event.ts"
import { type SessionRecord, type SessionState } from "../../shared/session-state.ts"
import { type VisitEndReason, type VisitState } from "../../shared/visit.ts"

/** しきい値の組。値は実物で遊んでから詰める出発点。 */
export type VisitTiming = {
  /** 信号が続けてこれだけ続いたら来る。 */
  readonly waitMs: number
  /** 前の訪問が帰ってからこれだけは来ない。 */
  readonly cooldownMs: number
  /** 台本の1行を出しておく間（`docs/screen-design.md` 13.7「吹き出しは2秒空ける」の2秒）。 */
  readonly lineIntervalMs: number
}

/** 本番のしきい値（短いビルドでは来ず、`bun run check` 1回ぶん程度の待ちで来るくらい）。 */
export const VISIT_TIMING = {
  waitMs: 90_000,
  cooldownMs: 30 * 60_000,
  lineIntervalMs: 2_000,
} satisfies VisitTiming

/**
 * 疑似セッションや手元で出入りを確かめるための縮めたしきい値（`TSUKUMO_VISIT_QUICK=1`。
 * `docs/architecture.md`「手で確かめること」）。**「1回の待ちに1度」は縮めない**ので、同じ待ちの
 * あいだに2度は来ない。
 */
export const QUICK_VISIT_TIMING = {
  waitMs: 5_000,
  cooldownMs: 0,
  lineIntervalMs: 2_000,
} satisfies VisitTiming

/**
 * いまの待ちの勘定。
 *
 * - `idle`: 待っていない
 * - `waiting`: `since` から続けて待っている
 * - `spent`: この待ちではもう来た（来ようとして客が居なかったときも）。待ちが途切れるまで来ない
 */
export type VisitWait =
  | { readonly kind: "idle" }
  | { readonly kind: "waiting"; readonly since: number }
  | { readonly kind: "spent" }

/** 前の訪問がいつ帰ったか。 */
export type LastVisit = { readonly kind: "never" } | { readonly kind: "left"; readonly at: number }

/** 来るかどうかを決めるために、イベントをまたいで持つ勘定。 */
export type VisitTally = { readonly wait: VisitWait; readonly lastVisit: LastVisit }

export const INITIAL_VISIT_TALLY = {
  wait: { kind: "idle" },
  lastVisit: { kind: "never" },
} as const satisfies VisitTally

/** 来るか。`later` はその時刻にもう一度聞けば来る（途中で何かが起きれば聞き直す）。 */
export type VisitArrival =
  | { readonly kind: "arrive" }
  | { readonly kind: "later"; readonly at: number }
  | { readonly kind: "never" }

/** 帰るか。 */
export type VisitDeparture =
  | { readonly kind: "stay" }
  | { readonly kind: "leave"; readonly reason: VisitEndReason }

/** 台本の次の一手。 */
export type VisitLineStep =
  | { readonly kind: "line"; readonly line: number }
  | { readonly kind: "finished" }

/** 訪問中の姿（{@link nextVisitLine} は訪問中にしか聞かない）。 */
export type Visiting = Extract<VisitState, { readonly kind: "visiting" }>

/** いま待っているか（信号 A か B。答え待ちと雑談モードでは待っていない）。 */
export function isWaiting(state: SessionState): boolean {
  if (state.chatMode || state.pending.length > 0) {
    return false
  }
  const backgroundOnly = state.turn.kind === "finished" && state.backgroundTasks.length > 0
  const toolRunning = state.turn.kind === "running" && hasRunningTopLevelTool(state.records)
  return backgroundOnly || toolRunning
}

/**
 * イベント1件を畳んだあとの姿（`state`）から、待ちの勘定を進める。`visit-started` でこの待ちを
 * 使い切り、`visit-ended` で帰った時刻を覚える。待ちが途切れたら数え直す。
 */
export function tallyVisit(
  tally: VisitTally,
  state: SessionState,
  event: SessionEvent,
  at: number,
): VisitTally {
  return {
    wait: nextWait(tally.wait, state, event, at),
    lastVisit: event.kind === "visit-ended" ? { kind: "left", at } : tally.lastVisit,
  }
}

/** 来ようとして客が居なかった。この待ちでは聞き直さない。 */
export function spendWait(tally: VisitTally): VisitTally {
  return tally.wait.kind === "waiting" ? { ...tally, wait: { kind: "spent" } } : tally
}

/**
 * 来るか・まだか（何時に）・来ないか。待ちが続けて {@link VisitTiming.waitMs} に届き、かつ前の
 * 訪問から {@link VisitTiming.cooldownMs} 空いていれば来る。
 */
export function visitArrival(
  tally: VisitTally,
  state: SessionState,
  now: number,
  timing: VisitTiming,
): VisitArrival {
  if (state.visit.kind === "visiting" || tally.wait.kind !== "waiting" || !isWaiting(state)) {
    return { kind: "never" }
  }
  const waited = tally.wait.since + timing.waitMs
  const due =
    tally.lastVisit.kind === "left"
      ? Math.max(waited, tally.lastVisit.at + timing.cooldownMs)
      : waited
  return due <= now ? { kind: "arrive" } : { kind: "later", at: due }
}

/**
 * イベント1件を畳んだあとの姿（`state`）で、客が帰るか。**帰る合図はここに集める**
 * （ブラウザ側で別々に判定しない。`docs/requirements.md` 4.3 の例外の条件3）。台本の終わりは
 * 時計から来るので {@link nextVisitLine} が決める。
 */
export function visitDeparture(state: SessionState, event: SessionEvent): VisitDeparture {
  if (state.visit.kind !== "visiting") {
    return { kind: "stay" }
  }
  const reason = departureReason(state, event)
  return reason === "stay" ? { kind: "stay" } : { kind: "leave", reason }
}

/** 台本の次の行へ進むか、言い終えたか。 */
export function nextVisitLine(visit: Visiting): VisitLineStep {
  const next = visit.line + 1
  return next < visit.script.length ? { kind: "line", line: next } : { kind: "finished" }
}

function nextWait(
  wait: VisitWait,
  state: SessionState,
  event: SessionEvent,
  at: number,
): VisitWait {
  if (!isWaiting(state)) {
    return { kind: "idle" }
  }
  if (event.kind === "visit-started") {
    return { kind: "spent" }
  }
  return wait.kind === "idle" ? { kind: "waiting", since: at } : wait
}

function departureReason(state: SessionState, event: SessionEvent): VisitEndReason | "stay" {
  switch (event.kind) {
    case "request":
      return "request"
    case "speech":
      return "speech"
    case "session-ended":
      return "session-ended"
    case "pending-changed":
      if (event.pending.length > 0) {
        return "pending"
      }
      break
    default:
      break
  }
  return isWaiting(state) ? "stay" : "wait-over"
}

/**
 * いまのやり取り（最後の依頼より後ろ）に、結果の来ていないトップレベルのツールがあるか。
 * 前のやり取りで中断されて結果が来なかったツールは数えない。
 */
function hasRunningTopLevelTool(records: readonly SessionRecord[]): boolean {
  const lastRequest = records.findLastIndex((record) => record.kind === "request")
  return records
    .slice(lastRequest + 1)
    .some((record) => record.kind === "tool" && !record.nested && record.status.kind === "running")
}
