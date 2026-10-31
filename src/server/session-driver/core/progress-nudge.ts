// 進みの差し込み。委譲中に吹き出しが黙り続けたとき、委譲先の進みの1行（`delegate-progress`）をメインへ差し込む。
// 背景のサブエージェントがいなくて背景の Bash だけを待っているときは、要約の代わりに待っている件数だけを差し込む。
// 差し込むかは3つの状態だけで決め、要約の文面は見ない:
// 委譲中か（背景のサブエージェントか Bash が顔ぶれにいる）、最後に描いたセリフからの経過、
// そのあとに新しい要約が届いたか（背景の Bash だけの待ちでは要らない）。
//
// 時計もタイマーも持たない。時刻は `observe` と `take` の引数で受け、待つのは呼び手が `due` の時刻まで。
// メインがターンの途中のあいだは差し込まず、ターンが終わるまで預ける。
// 預けているあいだにセリフが描かれたら、要約はそのセリフより前のものになるので捨てる。
//
// 要約は委譲先の会話から作られた字なので、ここから先は差し込む文面にだけ入れる。

import type { SessionEvent } from "../../../shared/session/session-event.ts"

/** 最後に描いたセリフ（か差し込み・委譲の始まり）から差し込むまでの黙っている時間。 */
const PROGRESS_NUDGE_SILENCE_MS = 5 * 60 * 1000

export type ProgressNudgeDue =
  | { readonly kind: "none" }
  | { readonly kind: "at"; readonly at: number }

export type ProgressNudgeTake =
  | { readonly kind: "none" }
  | { readonly kind: "nudge"; readonly summary: string }
  | { readonly kind: "shell-wait"; readonly count: number }

export type ProgressNudgeSend = Exclude<ProgressNudgeTake, { readonly kind: "none" }>

export type ProgressNudge = {
  /** 駆動が送り出すイベントを、送り出した時刻と一緒に渡す。 */
  readonly observe: (event: SessionEvent, at: number) => void
  /** いまの状態のままなら差し込む時刻。背景の待ちが無い・背景のサブエージェントがいるのに新しい要約が無い・ターンの途中なら `none`。背景の Bash だけの待ちは要約が無くても差し込む。 */
  readonly due: () => ProgressNudgeDue
  /** `at` が差し込む時刻を過ぎていれば最新の要約を1通（背景の Bash だけの待ちなら待っている件数を）取り出し、時計をそこから測り直す。 */
  readonly take: (at: number) => ProgressNudgeTake
}

type LatestSummary = { readonly kind: "none" } | { readonly kind: "fresh"; readonly text: string }

/** {@link ProgressNudge} を1つ作る。セッション1つに1つ。 */
export function createProgressNudge(): ProgressNudge {
  let delegates: ReadonlySet<string> = new Set()
  let shells: ReadonlySet<string> = new Set()
  let silentSince = 0
  let latest: LatestSummary = { kind: "none" }
  let inTurn = false

  const waitingOnShellsOnly = (): boolean => shells.size > 0 && delegates.size === 0
  const due = (): ProgressNudgeDue =>
    !inTurn && ((delegates.size > 0 && latest.kind === "fresh") || waitingOnShellsOnly())
      ? { kind: "at", at: silentSince + PROGRESS_NUDGE_SILENCE_MS }
      : { kind: "none" }

  return {
    observe: (event, at) => {
      switch (event.kind) {
        case "background-tasks-changed": {
          const idsOf = (kind: "agent" | "shell"): ReadonlySet<string> =>
            new Set(event.tasks.filter((task) => task.kind === kind).map((task) => task.taskId))
          const nextDelegates = idsOf("agent")
          const nextShells = idsOf("shell")
          if (delegates.size + shells.size === 0 && nextDelegates.size + nextShells.size > 0) {
            silentSince = at
          }
          if (nextDelegates.size === 0) {
            latest = { kind: "none" }
          }
          delegates = nextDelegates
          shells = nextShells
          return
        }
        case "delegate-progress":
          if (delegates.has(event.taskId)) {
            latest = { kind: "fresh", text: event.summary }
          }
          return
        case "speech":
          silentSince = at
          latest = { kind: "none" }
          return
        case "request":
        case "aside":
        case "turn-started":
        case "turn-resumed":
        case "progress-nudged":
          inTurn = true
          return
        case "turn-finished":
          inTurn = false
          return
        case "session-ended":
          delegates = new Set()
          shells = new Set()
          latest = { kind: "none" }
          inTurn = false
          return
        default:
          return
      }
    },
    due,
    take: (at) => {
      const scheduled = due()
      if (scheduled.kind === "none" || at < scheduled.at) {
        return { kind: "none" }
      }
      if (latest.kind === "none") {
        if (!waitingOnShellsOnly()) {
          return { kind: "none" }
        }
        silentSince = at
        return { kind: "shell-wait", count: shells.size }
      }
      const summary = latest.text
      latest = { kind: "none" }
      silentSince = at
      return { kind: "nudge", summary }
    },
  }
}

const PROGRESS_OPEN = "<tsukumo-progress>"
const PROGRESS_CLOSE = "</tsukumo-progress>"

/** 包みの全体。前後の空白だけを許し、包みの外に字があれば差し込みとして読まない。 */
const PROGRESS_PROMPT = /^<tsukumo-progress>\n?[\s\S]*?\n?<\/tsukumo-progress>$/

const PROGRESS_NOTE =
  "tsukumo の差し込み。委譲先の進み。`speak` を 1 回で言い直し、`report` は呼ばない"

const BACKGROUND_WAIT_NOTE =
  "tsukumo の差し込み。背景の Bash の待ち。`speak` を 1 回で、待っている様子を知らせ、`report` は呼ばない"

const STEP_LIMIT_NOTE =
  "tsukumo の差し込み。1 ターンのツール呼び出しが多い。`speak` を 1 回で、いまの様子を知らせ、`report` は呼ばない"

/** 差し込む要約を、メインへ送る文面に包む。 */
export function progressNudgePromptText(summary: string): string {
  return wrapProgress(PROGRESS_NOTE, summary)
}

/** 要約の無い背景 Bash の待ちを、件数だけの事実でメインへ送る文面に包む。 */
export function backgroundWaitPromptText(count: number): string {
  return wrapProgress(BACKGROUND_WAIT_NOTE, `背景の Bash を ${count} 件待っている`)
}

/** 歩数の上限を超えたことを、メインへ送る文面に包む。 */
export function stepLimitPromptText(limit: number): string {
  return wrapProgress(STEP_LIMIT_NOTE, `${limit} 回を超えた`)
}

/** transcript の `user` の文面が差し込みの包みか。入力の控え（`InputLedger`）の無い入力を、組み直しが利用者の依頼と見分ける手がかり。 */
export function isProgressNudgePrompt(raw: string): boolean {
  return PROGRESS_PROMPT.test(raw.trim())
}

function wrapProgress(note: string, body: string): string {
  return `${PROGRESS_OPEN}\n${note}\n${body}\n${PROGRESS_CLOSE}`
}
