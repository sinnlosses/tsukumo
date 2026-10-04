// タスク一覧を見張る。見回りのたびにプロジェクトの設定（`readProjectSettings`）を読み、`tasks.store` の方式の読み元（`TaskSource`）から一覧を読み、前回知らせたものと変わっていれば `onChange` を呼ぶ。
// 設定は見回りのたびに読み直す（画面から書いた値が主ブランチを動かさずに次の見回りで効く）。
// 読み元は設定が前回と変わった見回りでだけ選び直す（読み元が覚えている前回の読みを捨てないため）。
//
// - 設定が無い・`tasks` が無い: タスク運用なし（`{ kind: "none" }`）
// - 設定が読めない: 「不明」。既定の方式へ倒さない
// - `files`: `createTaskFileSource`（主ブランチの `develop/task/` と台帳の着手の印）
// - `beads`: `createTaskBeadsSource`（`bd` の課題）
//
// 見回りは `setWatching(true)` のあいだだけ回る。起こした時点の1回は、画面が無くても読む。
// 止めているあいだも覚えた状態は残し、再開の1回で変わっていれば `onChange` する。

import { isDeepEqual } from "remeda"

import {
  DEFAULT_RUN_PROMPT,
  mainBranchRefOf,
  type ProjectSettingsRead,
} from "../../../shared/repository/project-settings.ts"
import type { TaskSummaryResult } from "../../../shared/repository/task-summary.ts"
import { createBeadsStampReader, readBeadsIssues } from "./beads.ts"
import { runGit, runGitCatFileBatch } from "./git.ts"
import { readProjectSettings } from "./project-settings.ts"
import { createTaskBeadsSource } from "./task-beads-source.ts"
import {
  createClaimedIdsReader,
  createTaskFileSource,
  readClaimDirEntries,
} from "./task-file-source.ts"
import { fixedTaskSource, type TaskSource, type TaskSourceResult } from "./task-source.ts"

/**
 * 見回りの間隔。`git` は `git rev-parse` 1回が手元で約10msなので、毎回起こしても負荷は無視できる。
 * `bd list` は1回が約0.2秒（CPU）かかるので、Beads 方式のときは間を空ける。
 * タスク一覧はタスクの着手・完了で書き換わるだけなので、秒単位の反映で十分。
 */
export const TASK_SUMMARY_POLL_INTERVALS = {
  git: 1500,
  beads: 5000,
} satisfies TaskSummaryPollIntervals

export type TaskSummaryPollIntervals = {
  /** Beads 方式以外（ファイル方式・運用なし・設定が読めない）の間隔。 */
  readonly git: number
  /** Beads 方式の間隔。 */
  readonly beads: number
}

export type TaskSummaryWatcher = {
  /** ポーリングを止める。実行中の見回り（`git`・`bd` の子プロセス）の終わりまで待つ。 */
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
  readonly runGit: typeof runGit
  readonly runGitCatFileBatch: typeof runGitCatFileBatch
  readonly readProjectSettings: typeof readProjectSettings
  readonly readBeadsIssues: typeof readBeadsIssues
  readonly createBeadsStampReader: typeof createBeadsStampReader
  /** 台帳の着手の印の置き場の中の、ディレクトリ名の集合。読めないときは空。 */
  readonly readClaimDir: (claimDir: string) => Promise<ReadonlySet<string>>
  readonly clock: TaskSummaryClock
}

export type TaskSummaryOptions = {
  readonly intervals: TaskSummaryPollIntervals
  readonly ports: TaskSummaryPorts
}

export const REAL_TASK_SUMMARY_PORTS = {
  runGit,
  runGitCatFileBatch,
  readProjectSettings,
  readBeadsIssues,
  createBeadsStampReader,
  readClaimDir: readClaimDirEntries,
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
 * タスク一覧を見張り始める。
 * 呼んだ時点で1回見に行き、以後は `setWatching(true)` のあいだ、ポーリングで設定と読み元を見る。
 * 1回の見回りが終わってから次の見回りを予約するので、`git`・`bd` が遅くても見回りは重ならない。
 * 見回りが失敗しても止めず、`onFailure` へ渡して次の間隔でやり直す。
 * 知らせるのは前回知らせたもの（初めは画面の初期の姿と同じ `{ kind: "unknown" }`）と違う結果だけ。
 */
export function watchTaskSummary(
  cwd: string,
  onChange: (result: TaskSummaryResult) => void,
  options: TaskSummaryOptions = {
    intervals: TASK_SUMMARY_POLL_INTERVALS,
    ports: REAL_TASK_SUMMARY_PORTS,
  },
  onFailure: (error: unknown) => void = () => {},
): TaskSummaryWatcher {
  const { intervals, ports } = options
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
      cancelTimer = ports.clock.after(
        chosen !== undefined && isBeadsStore(chosen.settings) ? intervals.beads : intervals.git,
        loop,
      )
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
 * 台帳の置き場と Beads の変化の印の読み手は起動中に変わらないので、見張り1つにつき1つだけ作り、読み元を選び直しても使い回す。
 */
function createTaskSourceChooser(
  cwd: string,
  ports: TaskSummaryPorts,
): (settings: ProjectSettingsRead) => TaskSource {
  const readClaimedIds = createClaimedIdsReader(cwd, ports)
  const readBeadsStamp = ports.createBeadsStampReader(cwd)

  return (settings) => {
    switch (settings.kind) {
      case "none":
        return fixedTaskSource({ kind: "none" })
      case "invalid":
        return fixedTaskSource({ kind: "settings-invalid" })
      case "read":
        switch (settings.tasks.store) {
          case "files":
            return createTaskFileSource(cwd, mainBranchRefOf(settings.tasks), {
              runGit: ports.runGit,
              runGitCatFileBatch: ports.runGitCatFileBatch,
              readClaimedIds,
            })
          case "beads":
            return createTaskBeadsSource(cwd, {
              readBeadsIssues: ports.readBeadsIssues,
              readBeadsStamp,
            })
        }
    }
  }
}

function isBeadsStore(settings: ProjectSettingsRead): boolean {
  return settings.kind === "read" && settings.tasks.store === "beads"
}
