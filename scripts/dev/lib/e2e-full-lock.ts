// `pnpm run check --full` の E2E の段が、作業ツリーをまたいで同時に1つだけ走るための錠。
// 錠は共有の git dir のファイル1つで、中身は持ち主の pid。持ち主が死んでいれば奪う。
// 奪うときの読み直しと消去の間は排他でないので、同時に奪う2者のうち遅い側が相手の新しい錠を消すことがある。

import { readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import { readGitCommonDirectory } from "../../shared/git-query.ts"

const LOCK_FILE_NAME = "e2e-full-lock"

const WAIT_LIMIT_MS = 15 * 60_000
const POLL_INTERVAL_MS = 2_000
const NOTICE_INTERVAL_MS = 60_000

/** 時計・生死の判定・待つ・出力を差し替える口。 */
export type LockEnvironment = {
  readonly pid: number
  readonly isAlive: (pid: number) => boolean
  readonly now: () => number
  readonly sleep: (milliseconds: number) => Promise<void>
  readonly notify: (line: string) => void
}

export class LockWaitTimeoutError extends Error {}

export const REAL_LOCK_ENVIRONMENT = {
  pid: process.pid,
  isAlive: isProcessAlive,
  now: () => Temporal.Now.instant().epochMilliseconds,
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  notify: (line) => process.stdout.write(`${line}\n`),
} satisfies LockEnvironment

/** 作業ツリーをまたいで共有される錠のパス（git の共通 dir の中）。 */
export function sharedLockPath(root: string): string {
  return join(readGitCommonDirectory(root), LOCK_FILE_NAME)
}

/**
 * 錠を取り、解放する関数を返す。持ち主が生きている間は待ち、待ちが `limitMs` を超えたら
 * `LockWaitTimeoutError` を投げる（錠は取らない）。
 */
export async function acquireLock(
  lockPath: string,
  environment: LockEnvironment,
  limitMs: number = WAIT_LIMIT_MS,
): Promise<() => void> {
  const startedAt = environment.now()
  let lastNoticeAt: number | undefined
  let sawUnreadable = false
  while (true) {
    if (tryCreate(lockPath, environment.pid)) {
      return () => removeIfOwnedBy(lockPath, environment.pid)
    }
    const owner = readOwner(lockPath)
    if (owner !== undefined && !environment.isAlive(owner)) {
      removeIfOwnedBy(lockPath, owner)
      continue
    }
    if (owner === undefined) {
      // 書きかけは次の読み直しで持ち主が見える。続けて読めないなら壊れた錠として消す
      if (sawUnreadable) {
        rmSync(lockPath, { force: true })
        sawUnreadable = false
        continue
      }
      sawUnreadable = true
    } else {
      sawUnreadable = false
    }
    const waited = environment.now() - startedAt
    if (waited >= limitMs) {
      throw new LockWaitTimeoutError(
        `別の作業ツリーの E2E 全件（pid ${owner ?? "不明"}）が ${Math.round(limitMs / 60_000)} 分たっても終わらないので、錠を取らずに諦める。持ち主がもういないなら ${lockPath} を消す`,
      )
    }
    if (lastNoticeAt === undefined || environment.now() - lastNoticeAt >= NOTICE_INTERVAL_MS) {
      lastNoticeAt = environment.now()
      environment.notify(
        `別の作業ツリーの E2E 全件（pid ${owner ?? "不明"}）が終わるのを待っている（最大 ${Math.round(limitMs / 60_000)} 分）`,
      )
    }
    await environment.sleep(POLL_INTERVAL_MS)
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return isErrnoCode(error, "EPERM")
  }
}

function tryCreate(lockPath: string, pid: number): boolean {
  try {
    writeFileSync(lockPath, `${pid}\n`, { flag: "wx" })
    return true
  } catch (error) {
    if (isErrnoCode(error, "EEXIST")) {
      return false
    }
    throw error
  }
}

/** 錠の持ち主。ファイルが無い・壊れているときは `undefined`。 */
function readOwner(lockPath: string): number | undefined {
  try {
    const owner = Number.parseInt(readFileSync(lockPath, "utf8"), 10)
    return Number.isInteger(owner) && owner > 0 ? owner : undefined
  } catch {
    return undefined
  }
}

function removeIfOwnedBy(lockPath: string, pid: number): void {
  if (readOwner(lockPath) === pid) {
    rmSync(lockPath, { force: true })
  }
}

function isErrnoCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code
}
