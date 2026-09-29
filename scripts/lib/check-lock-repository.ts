// 同じリポジトリのすべての作業ツリーで、重い段を走らせる check を1つに絞る錠。
// 置き場は `git rev-parse --git-common-dir` の下で、`mkdir` の原子性で取り合う。
// 持ち主の pid が生きていない錠は落ちたプロセスの残骸として奪う。

import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"
import process from "node:process"
import { setTimeout as sleep } from "node:timers/promises"

const LOCK_DIRECTORY_NAME = "tsukumo-check.lock"
const POLL_INTERVAL_MS = 1000
const PID_FILE_GRACE_MS = 10_000

/** 錠を取れるまで待ち、取れたら外す関数を返す。待つあいだ1行だけ出す。 */
export async function acquireCheckLock(root: string): Promise<() => void> {
  const lockPath = join(resolveCommonDirectory(root), LOCK_DIRECTORY_NAME)
  let announced = false
  while (!tryCreateLock(lockPath)) {
    if (!announced) {
      process.stdout.write("別の作業ツリーの check が重い段を走らせているので、終わるのを待つ\n")
      announced = true
    }
    await sleep(POLL_INTERVAL_MS)
  }
  return () => {
    rmSync(lockPath, { recursive: true, force: true })
  }
}

function resolveCommonDirectory(root: string): string {
  const output = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
  }).trim()
  return isAbsolute(output) ? output : resolve(root, output)
}

function tryCreateLock(lockPath: string): boolean {
  try {
    mkdirSync(lockPath)
  } catch (error) {
    if (!isErrorCode(error, "EEXIST")) {
      throw error
    }
    return isStale(lockPath) && evict(lockPath) && tryCreateLock(lockPath)
  }
  writeFileSync(join(lockPath, "pid"), String(process.pid))
  return true
}

function isStale(lockPath: string): boolean {
  const pid = readLockPid(lockPath)
  if (pid === undefined) {
    // 取った直後で pid をまだ書き終えていない錠は、しばらく生きているとみなす
    try {
      return (
        Temporal.Now.instant().epochMilliseconds - statSync(lockPath).mtimeMs > PID_FILE_GRACE_MS
      )
    } catch {
      return true
    }
  }
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    return isErrorCode(error, "ESRCH")
  }
}

function readLockPid(lockPath: string): number | undefined {
  try {
    const pid = Number(readFileSync(join(lockPath, "pid"), "utf8"))
    return Number.isInteger(pid) && pid > 0 ? pid : undefined
  } catch {
    return undefined
  }
}

/** 改名は1つのプロセスだけが成功するので、残骸を奪い合っても新しい錠を消さない。 */
function evict(lockPath: string): boolean {
  const graveyard = `${lockPath}.${process.pid}`
  try {
    renameSync(lockPath, graveyard)
  } catch {
    return false
  }
  rmSync(graveyard, { recursive: true, force: true })
  return true
}

function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code
}
