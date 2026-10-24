// 使い捨ての問い合わせを、鍵ごとにプロセスをまたいで1本にする錠。
// 錠のファイルを排他で作れたときだけ取れる。中身は書いた時刻だけで、古さはファイルの更新時刻で測る。

import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

import type { QueryLock, QueryLockPort } from "../core/throwaway-query.ts"
import { isoWithOffset } from "./local-time.ts"

/**
 * 錠を取る口を作る。`pathOf` は鍵から錠のファイルのパスを決める。
 * 書いてから `staleAfterMs` を過ぎた錠は、落ちたプロセスの残りとして消して取り直す。
 */
export function createQueryLock(pathOf: (key: string) => string): QueryLockPort<string> {
  return (key, staleAfterMs, now) => {
    const path = pathOf(key)
    if (createLockFile(path, now)) {
      return releasableLock(path)
    }
    if (!isStaleLock(path, staleAfterMs, now)) {
      return undefined
    }
    removeLockFile(path)
    return createLockFile(path, now) ? releasableLock(path) : undefined
  }
}

/** 錠のファイルを排他（`wx`）で作る。既にある・作れないときは `false`。 */
function createLockFile(path: string, now: Temporal.Instant): boolean {
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, isoWithOffset(now.epochMilliseconds), { flag: "wx" })
    return true
  } catch {
    return false
  }
}

/** 錠が書いてから `staleAfterMs` を過ぎているか。読めない（消えた）錠も取り直してよい側に倒す。 */
function isStaleLock(path: string, staleAfterMs: number, now: Temporal.Instant): boolean {
  try {
    return now.epochMilliseconds - statSync(path).mtimeMs > staleAfterMs
  } catch {
    return true
  }
}

function releasableLock(path: string): QueryLock {
  return {
    release: () => {
      removeLockFile(path)
    },
  }
}

function removeLockFile(path: string): void {
  try {
    rmSync(path, { force: true })
  } catch {
    // 消せなかった錠は、古さの閾値を過ぎたところで次の誰かが取り直す。
  }
}
