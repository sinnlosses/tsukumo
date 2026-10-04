// 診断ログの書き口・読み口の契約と、足跡を束ねて書く係。
// 1ターンで数百届くイベントの足跡を1件ずつ書かず、間隔ごとにまとめて書き口へ渡す。

import type { DiagnosticEntry } from "../../../shared/diagnostic/diagnostic-record.ts"

/** 診断ログの読み書き口。書けなくても・読めなくても例外を投げない。 */
export type DiagnosticLog = {
  readonly append: (entries: readonly DiagnosticEntry[]) => void
  /** 範囲に入る件を時刻の順に返す。壊れた行・版が違う行は読まずに落とす。 */
  readonly readRange: (range: DiagnosticRange) => readonly DiagnosticEntry[]
}

/** 読む範囲（エポックミリ秒。`startAt` を含み `endAt` を含まない）。 */
export type DiagnosticRange = {
  readonly startAt: number
  readonly endAt: number
}

/** 足跡を積み、間隔ごとに1回だけまとめて書き口へ渡す入れ物。 */
export type DiagnosticBuffer = {
  /** 1件積む。待っている書き出しが無いときだけそこから間隔を数え始める。 */
  readonly add: (entry: DiagnosticEntry) => void
  /** 積んだものを待たずに書き出す（プロセスを終える前に呼ぶ）。 */
  readonly flush: () => void
}

export function createDiagnosticBuffer(log: DiagnosticLog, intervalMs: number): DiagnosticBuffer {
  let buffered: readonly DiagnosticEntry[] = []
  // 書き出しを待っているタイマー（`docs/coding-standards.md`「「無いかもしれない」値」の例外4）。
  let timer: ReturnType<typeof setTimeout> | undefined = undefined

  const flush = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    if (buffered.length === 0) {
      return
    }
    const entries = buffered
    buffered = []
    log.append(entries)
  }

  return {
    add: (entry) => {
      buffered = [...buffered, entry]
      if (timer === undefined) {
        timer = setTimeout(flush, intervalMs)
      }
    },
    flush,
  }
}
