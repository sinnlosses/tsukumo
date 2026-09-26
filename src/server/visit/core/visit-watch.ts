// 訪問の見張り（`docs/design.md` 5章「訪問の契機と状態」）。駆動1代ぶんの持ち物として
// `session-manager.ts` が代ごとに1つ作り、駆動由来のイベントを畳むたびに {@link VisitWatch.observe}
// へ渡す。起こし直すと代ごと捨てられるので、掛けていた時計も待ちの勘定も一緒に消える。
//
// 判断は `visit-timing.ts`（来る・帰る・次の行）と `visit-guest.ts`（誰がどの台本で）の純関数で、
// ここが持つのはイベントをまたぐ勘定と、掛けた時計と、作っている最中の台本の中断だけ。
// 台本は来ると決めた時点で作り始め（`visit-script-writer.ts`）、できたら `visit-started` を出す。
// 作れなかった（時間切れも）らパックの台本へ落とし、それも無ければ来ない。作っている最中に
// 帰る合図が来たら中断して来ない（`visit-script.ts` の `interruptsVisitScript`）。時計そのものは渡される
// （{@link VisitClock}。本番は `src/server/visit/adapter/visit-clock.ts`）。
//
// 出したイベント（`visit-started` / `visit-line-advanced` / `visit-ended`）は `emit` で
// session-manager の受け口へ戻し、ほかのイベントと同じく畳んで配る。そのイベントも見張りの
// `observe` に戻ってくるので、行の時計と待ちの勘定はそこで進める（出したその場では進めない）。
//
// 台本は会話の内容に当たる。ログにもファイルにも書かない（docs/coding-standards.md「会話内容の扱い」）。

import { type SessionEvent } from "../../../shared/session-event.ts"
import { type SessionState } from "../../../shared/session-state.ts"
import { type VisitEvent } from "../../../shared/visit.ts"
import {
  chooseVisit,
  type VisitChoice,
  type VisitFallback,
  type VisitGuest,
} from "./visit-guest.ts"
import {
  type VisitScriptDraft,
  type VisitScriptSource,
  type VisitScriptWriter,
} from "./visit-script-writer.ts"
import {
  interruptsVisitScript,
  VISIT_SCRIPT_TIMEOUT_MS,
  visitWaitedMs,
  visitWorkExcerpt,
} from "./visit-script.ts"
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
  /** 客になれるパックの一覧。来るときに1回だけ読む（`visitGuests` で拾ったもの）。 */
  readonly listGuests: () => readonly VisitGuest[]
  /** 0 以上 1 未満の乱数（客・台本・帰りの一言を選ぶ）。 */
  readonly random: () => number
  /** 台本の出どころ（その場で作るか、パックの台本だけか）。 */
  readonly scriptSource: VisitScriptSource
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
  /** 駆動由来のイベント1件を畳んだあとに渡す（`at` はそのイベントに打った時刻）。 */
  readonly observe: (event: SessionEvent, at: number) => void
  /** 掛けている時計を外す（代を閉じるとき）。 */
  readonly close: () => void
}

/** 来ることになった客（{@link VisitChoice} の `chosen`）。 */
type Chosen = Extract<VisitChoice, { readonly kind: "chosen" }>

/** 何も掛けていないときの取り消し。 */
const NOTHING_TO_CANCEL = (): void => {}

export function createVisitWatch(options: VisitWatchOptions): VisitWatch {
  let tally: VisitTally = INITIAL_VISIT_TALLY
  let cancelArrival = NOTHING_TO_CANCEL
  let cancelLine = NOTHING_TO_CANCEL
  let cancelScript = NOTHING_TO_CANCEL

  /** 来るかを聞き直し、来るなら迎え、まだならその時刻に時計を掛ける。 */
  const scheduleArrival = (now: number): void => {
    cancelArrival()
    cancelArrival = NOTHING_TO_CANCEL
    const arrival = visitArrival(tally, options.readState(), now, options.timing)
    switch (arrival.kind) {
      case "arrive":
        arrive(now)
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

  /**
   * 客を選び、台本を用意して迎える。来ようとした時点でこの待ちは使い切る（あるじが
   * 分からない・候補が居ない・台本が無いときも、この待ちでは聞き直さない）。
   */
  const arrive = (now: number): void => {
    const state = options.readState()
    const host = state.character?.pack
    const waitedMs = visitWaitedMs(tally.wait, now)
    tally = spendWait(tally)
    if (host === undefined) {
      return
    }
    const choice = chooseVisit(options.listGuests(), host, options.random)
    if (choice.kind === "none") {
      return
    }
    switch (options.scriptSource.kind) {
      case "pack-only":
        welcome(choice, choice.fallback)
        return
      case "write":
        writeScript(options.scriptSource.write, choice, {
          host,
          guest: choice.guest,
          excerpt: visitWorkExcerpt(state),
          waitedMs,
        })
        return
    }
  }

  /**
   * 台本を作らせる。できたらそれで、作れなかった・時間切れならパックの台本で迎える。
   * {@link cancelScript}（帰る合図・代を閉じる）で中断したときは来ない。
   */
  const writeScript = (write: VisitScriptWriter, choice: Chosen, draft: VisitScriptDraft): void => {
    const controller = new AbortController()
    let done = false
    const cancelTimeout = options.clock.after(VISIT_SCRIPT_TIMEOUT_MS, () => {
      controller.abort()
    })
    const finish = (fallback: VisitFallback): void => {
      if (done) {
        return
      }
      done = true
      cancelTimeout()
      cancelScript = NOTHING_TO_CANCEL
      welcome(choice, fallback)
    }
    cancelScript = () => {
      done = true
      cancelTimeout()
      controller.abort()
    }
    void write(draft, controller.signal).then(
      (outcome) => {
        finish(
          outcome.kind === "written" ? { kind: "script", script: outcome.script } : choice.fallback,
        )
      },
      () => {
        finish(choice.fallback)
      },
    )
  }

  /** 台本があれば迎える（無ければ来ない）。 */
  const welcome = (choice: Chosen, script: VisitFallback): void => {
    if (script.kind === "none") {
      return
    }
    options.emit({
      kind: "visit-started",
      guest: choice.guest,
      script: script.script,
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
      if (interruptsVisitScript(state, event)) {
        cancelScript()
        cancelScript = NOTHING_TO_CANCEL
      }
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
      cancelScript()
      cancelArrival = NOTHING_TO_CANCEL
      cancelLine = NOTHING_TO_CANCEL
      cancelScript = NOTHING_TO_CANCEL
    },
  }
}
