// タスク一覧を見張る。見回りのたびにプロジェクトの設定（`readProjectSettings`）を読み、読み元（`TaskSource`）から一覧を読み、前回知らせたものと変わっていれば `onChange` を呼ぶ。
// 設定は見回りのたびに読み直す（画面から書いた値が主ブランチを動かさずに次の見回りで効く）。
// 読み元は設定が前回と変わった見回りでだけ選び直す（読み元が覚えている前回の読みを捨てないため）。
//
// - 設定が読めない: 「設定が読めない」。Beads を読まない
// - `tasks: "off"`: 「使わない」。Beads を読まない
// - それ以外（設定が無いときも）: `createTaskBeadsSource`（`bd` の課題。`.beads` が無ければ「不明」）
//
// 見回りは `setWatching(true)` のあいだだけ回る。起こした時点の1回は、画面が無くても読む。
// 止めているあいだも覚えた状態は残し、再開の1回で変わっていれば `onChange` する。

import { isDeepEqual } from "remeda"

import {
  DEFAULT_RUN_PROMPT,
  type ProjectSettingsRead,
} from "../../../shared/repository/project-settings.ts"
import type { TaskSummaryResult } from "../../../shared/repository/task-summary.ts"
import { createBeadsStampReader, readBeadsIssues } from "./beads.ts"
import { createFakeBeadsStampReader, readFakeBeadsIssues } from "./fake-beads.ts"
import { readProjectSettings } from "./project-settings.ts"
import { createTaskBeadsSource } from "./task-beads-source.ts"
import { fixedTaskSource, type TaskSource, type TaskSourceResult } from "./task-source.ts"

/**
 * 見回りの間隔。`bd list` は1回が約0.2秒（CPU）かかるので間を空ける。
 * タスク一覧はタスクの着手・完了で書き換わるだけなので、秒単位の反映で十分。
 */
export const TASK_SUMMARY_POLL_INTERVAL_MS = 5000

export type TaskSummaryWatcher = {
  /** ポーリングを止める。実行中の見回り（`bd` の子プロセス）の終わりまで待つ。 */
  readonly close: () => Promise<void>
  /**
   * 見回りを回すかどうか。真にすると、実行中でなければ今すぐ1回読んでから間隔ごとの見回りを再開する。偽にすると次の見回りを予約しない。
   * `close` のあとは何もしない。
   */
  readonly setWatching: (watching: boolean) => void
}

/** 時計の口。`delayMs` 後に `wake` を1回呼び、返した関数で取り消す。 */
export type TaskSummaryClock = {
  readonly after: (delayMs: number, wake: () => void) => () => void
}

/** 見回りが外の世界を読む口。確かめるときは偽に差し替える。 */
export type TaskSummaryPorts = {
  readonly readProjectSettings: typeof readProjectSettings
  readonly readBeadsIssues: typeof readBeadsIssues
  readonly createBeadsStampReader: typeof createBeadsStampReader
  readonly clock: TaskSummaryClock
}

export type TaskSummaryOptions = {
  readonly intervalMs: number
  readonly ports: TaskSummaryPorts
}

export const REAL_TASK_SUMMARY_PORTS = {
  readProjectSettings,
  readBeadsIssues,
  createBeadsStampReader,
  clock: {
    after: (delayMs, wake) => {
      const timer = setTimeout(wake, delayMs)
      timer.unref()
      return () => {
        clearTimeout(timer)
      }
    },
  },
} satisfies TaskSummaryPorts

/**
 * 疑似セッションの見回りの間隔。読むのはファイル1つと設定だけなので、
 * E2E の足場が置いた一覧と画面から書いた設定を、待たせずに届ける。
 */
export const FAKE_TASK_SUMMARY_POLL_INTERVAL_MS = 200

/**
 * 見張りの間隔と口。ふだん（`real`）は `bd` を読み、疑似セッション（`fake`）は `bd` の代わりに
 * `readFakeBeadsIssues` のファイルを読む。設定の読み出しと時計はどちらも本物。
 */
export function taskSummaryOptionsOf(driver: "real" | "fake"): TaskSummaryOptions {
  switch (driver) {
    case "real":
      return { intervalMs: TASK_SUMMARY_POLL_INTERVAL_MS, ports: REAL_TASK_SUMMARY_PORTS }
    case "fake":
      return {
        intervalMs: FAKE_TASK_SUMMARY_POLL_INTERVAL_MS,
        ports: {
          ...REAL_TASK_SUMMARY_PORTS,
          readBeadsIssues: readFakeBeadsIssues,
          createBeadsStampReader: createFakeBeadsStampReader,
        },
      }
  }
}

/**
 * タスク一覧を見張り始める。
 * 呼んだ時点で1回見に行き、以後は `setWatching(true)` のあいだ、ポーリングで設定と読み元を見る。
 * 1回の見回りが終わってから次の見回りを予約するので、`bd` が遅くても見回りは重ならない。
 * 見回りが失敗しても止めず、`onFailure` へ渡して次の間隔でやり直す。
 * 知らせるのは前回知らせたもの（初めは画面の初期の姿と同じ `{ kind: "unknown" }`）と違う結果だけ。
 */
export function watchTaskSummary(
  cwd: string,
  onChange: (result: TaskSummaryResult) => void,
  options: TaskSummaryOptions = taskSummaryOptionsOf("real"),
  onFailure: (error: unknown) => void = () => {},
): TaskSummaryWatcher {
  const { intervalMs, ports } = options
  const choose = createTaskSourceChooser(cwd, ports)
  let chosen: ChosenSource | undefined = undefined
  let notified: TaskSummaryResult = { kind: "unknown" }
  let cancelTimer: (() => void) | undefined = undefined
  let watching = false
  let polling = false
  let closed = false
  let runningPoll: Promise<void> = Promise.resolve()

  const poll = async (): Promise<void> => {
    const settings = await ports.readProjectSettings(cwd)
    if (chosen === undefined || !isDeepEqual(settings, chosen.settings)) {
      chosen = { settings, source: choose(settings) }
    }
    const read = await chosen.source.read()
    if (closed || read.kind === "unchanged") {
      return
    }
    const result = withRunPrompt(read.result, chosen.settings)
    if (isDeepEqual(result, notified)) {
      return
    }
    notified = result
    onChange(result)
  }

  const loop = (): void => {
    cancelTimer = undefined
    polling = true
    runningPoll = poll().catch(onFailure)
    void runningPoll.then(() => {
      polling = false
      if (closed || !watching) {
        return
      }
      cancelTimer = ports.clock.after(intervalMs, loop)
    })
  }

  loop()

  return {
    close: () => {
      closed = true
      cancelTimer?.()
      return runningPoll
    },
    setWatching: (next) => {
      if (closed || next === watching) {
        return
      }
      watching = next
      if (!next) {
        cancelTimer?.()
        cancelTimer = undefined
        return
      }
      if (!polling) {
        cancelTimer?.()
        loop()
      }
    },
  }
}

/** 読み元の `known` に、設定の「tsukumo に頼む」の文面を付ける。 */
function withRunPrompt(result: TaskSourceResult, settings: ProjectSettingsRead): TaskSummaryResult {
  if (result.kind !== "known") {
    return result
  }
  const runPrompt = settings.kind === "read" ? settings.tasks.runPrompt : DEFAULT_RUN_PROMPT
  return { ...result, runPrompt }
}

/** いま使っている読み元と、それを選んだときの設定。 */
type ChosenSource = {
  readonly settings: ProjectSettingsRead
  readonly source: TaskSource
}

/**
 * 設定から読み元を作る関数を作る。
 * Beads の変化の印の読み手は起動中に変わらないので、見張り1つにつき1つだけ作り、読み元を選び直しても使い回す。
 */
function createTaskSourceChooser(
  cwd: string,
  ports: TaskSummaryPorts,
): (settings: ProjectSettingsRead) => TaskSource {
  const readBeadsStamp = ports.createBeadsStampReader(cwd)

  const beads = createTaskBeadsSource(cwd, {
    readBeadsIssues: ports.readBeadsIssues,
    readBeadsStamp,
  })
  return (settings) => {
    switch (settings.kind) {
      case "invalid":
        return fixedTaskSource({ kind: "settings-invalid" })
      case "off":
        return fixedTaskSource({ kind: "off" })
      case "none":
      case "read":
        return beads
    }
  }
}
