// 訪問の見張り（`docs/design.md` 5章「訪問の契機と状態」）。**駆動1代ぶんの持ち物**として
// `session-manager.ts` が代ごとに1つ作り、駆動由来のイベントを畳むたびに {@link VisitWatch.observe}
// へ渡す。起こし直すと代ごと捨てられるので、掛けていた時計も待ちの勘定も一緒に消える。
//
// 判断は `visit-timing.ts`（来る・帰る・次の行）と `visit-guest.ts`（誰がどの台本で）の純関数で、
// ここが持つのは**イベントをまたぐ勘定と、掛けた時計**だけ。時計そのものは渡される
// （{@link VisitClock}。本番は `src/server/adapter/visit-clock.ts`）。
//
// 出したイベント（`visit-started` / `visit-line-advanced` / `visit-ended`）は `emit` で
// session-manager の受け口へ戻し、ほかのイベントと同じく畳んで配る。**そのイベントも見張りの
// `observe` に戻ってくる**ので、行の時計と待ちの勘定はそこで進める（出したその場では進めない）。
//
// 台本は会話の内容に当たる。ログにもファイルにも書かない（docs/coding-standards.md「会話内容の扱い」）。

import { type SessionEvent } from "../../shared/session-event.ts"
import { type SessionState } from "../../shared/session-state.ts"
import { type VisitEvent } from "../../shared/visit.ts"
import { chooseVisit, type VisitGuest } from "./visit-guest.ts"
import {
  INITIAL_VISIT_TALLY,
  nextVisitLine,
  spendWait,
  tallyVisit,
  type VisitTally,
  type VisitTiming,
  visitArrival,
  visitDeparture,
} from "./visit-timing.ts"

/** 時計の口。`delayMs` 後に `wake` を1回呼び、返した関数で取り消す。 */
export type VisitClock = {
  readonly after: (delayMs: number, wake: () => void) => () => void
}

/** 訪問のために外の世界から渡すもの（配線は `src/session-start.ts`）。 */
export type VisitPorts = {
  /** しきい値（本番は `VISIT_TIMING`、確かめるときは `QUICK_VISIT_TIMING`）。 */
  readonly timing: VisitTiming
  readonly clock: VisitClock
  /** 客になれるパックの一覧。**来るときに1回だけ読む**（`visitGuests` で拾ったもの）。 */
  readonly listGuests: () => readonly VisitGuest[]
  /** 0 以上 1 未満の乱数（客・台本・帰りの一言を選ぶ）。 */
  readonly random: () => number
}

export type VisitWatchOptions = VisitPorts & {
  /** いまの時刻（エポックミリ秒。session-manager が時刻を打つのと同じ時計）。 */
  readonly now: () => number
  /** いまの姿（session-manager が畳んだもの）。 */
  readonly readState: () => SessionState
  /** 訪問のイベントを session-manager の受け口へ戻す。 */
  readonly emit: (event: VisitEvent) => void
}

export type VisitWatch = {
  /** 駆動由来のイベント1件を**畳んだあとに**渡す（`at` はそのイベントに打った時刻）。 */
  readonly observe: (event: SessionEvent, at: number) => void
  /** 掛けている時計を外す（代を閉じるとき）。 */
  readonly close: () => void
}

/** 何も掛けていないときの取り消し。 */
const NOTHING_TO_CANCEL = (): void => {}

export function createVisitWatch(options: VisitWatchOptions): VisitWatch {
  let tally: VisitTally = INITIAL_VISIT_TALLY
  let cancelArrival = NOTHING_TO_CANCEL
  let cancelLine = NOTHING_TO_CANCEL

  /** 来るかを聞き直し、来るなら迎え、まだならその時刻に時計を掛ける。 */
  const scheduleArrival = (now: number): void => {
    cancelArrival()
    cancelArrival = NOTHING_TO_CANCEL
    const arrival = visitArrival(tally, options.readState(), now, options.timing)
    switch (arrival.kind) {
      case "arrive":
        arrive()
        return
      case "later":
        cancelArrival = options.clock.after(arrival.at - now, () => {
          cancelArrival = NOTHING_TO_CANCEL
          scheduleArrival(options.now())
        })
        return
      case "never":
        return
    }
  }

  /** 客を選んで迎える。あるじが分からない・候補が居ないときは、この待ちでは聞き直さない。 */
  const arrive = (): void => {
    const host = options.readState().character?.pack
    if (host === undefined) {
      tally = spendWait(tally)
      return
    }
    const choice = chooseVisit(options.listGuests(), host, options.random)
    if (choice.kind === "none") {
      tally = spendWait(tally)
      return
    }
    options.emit({
      kind: "visit-started",
      guest: choice.guest,
      script: choice.script,
      farewell: choice.farewell,
    })
  }

  /** いまの行を出しておく間だけ待ち、次の行へ進めるか、言い終えたら帰す。 */
  const scheduleLine = (): void => {
    cancelLine()
    cancelLine = options.clock.after(options.timing.lineIntervalMs, () => {
      cancelLine = NOTHING_TO_CANCEL
      const visit = options.readState().visit
      if (visit.kind !== "visiting") {
        return
      }
      const step = nextVisitLine(visit)
      options.emit(
        step.kind === "line"
          ? { kind: "visit-line-advanced", line: step.line }
          : { kind: "visit-ended", reason: "script-finished" },
      )
    })
  }

  return {
    observe: (event, at) => {
      const state = options.readState()
      tally = tallyVisit(tally, state, event, at)
      const departure = visitDeparture(state, event)
      if (departure.kind === "leave") {
        // 帰りの `visit-ended` もここへ戻ってくるので、時計の掛け替えはそちらに任せる。
        options.emit({ kind: "visit-ended", reason: departure.reason })
        return
      }
      if (event.kind === "visit-started" || event.kind === "visit-line-advanced") {
        scheduleLine()
      }
      if (event.kind === "visit-ended") {
        cancelLine()
        cancelLine = NOTHING_TO_CANCEL
      }
      scheduleArrival(at)
    },
    close: () => {
      cancelArrival()
      cancelLine()
      cancelArrival = NOTHING_TO_CANCEL
      cancelLine = NOTHING_TO_CANCEL
    },
  }
}
