// 作業ツリーをまたぐ check の錠の出入りを、一時リポジトリの上で検証する。

import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, test } from "vitest"

import {
  acquireCheckLock,
  acquireCheckLockUnlessHeld,
  withCheckLockOwner,
} from "../../scripts/lib/check-lock-repository.ts"
import { runSubprocessOrThrow } from "../fixture/subprocess.ts"
import { useTempDir } from "../fixture/temp-dir.ts"

// 一時リポジトリの git も走らせるので、既定の 5000ms では負荷で足りないことがある。
const WAIT_TIMEOUT_MS = 20_000
const TEST_POLL_INTERVAL_MS = 20
const SETTLE_PROBE_MS = 150

describe("check の錠", { timeout: WAIT_TIMEOUT_MS }, () => {
  const tempDir = useTempDir("check-lock")

  async function createRepository(): Promise<string> {
    const root = tempDir()
    await runSubprocessOrThrow("git", ["init", "--quiet"], { cwd: root })
    return root
  }

  function lockPath(root: string): string {
    return join(root, ".git", "tsukumo-check.lock")
  }

  function isSettled(promise: Promise<unknown>, afterMs: number): Promise<boolean> {
    return Promise.race([
      promise.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), afterMs)),
    ])
  }

  test("取ると持ち主の pid が入り、外すと消える", async () => {
    const root = await createRepository()

    const release = await acquireCheckLock(root)
    expect(readFileSync(join(lockPath(root), "pid"), "utf8")).toBe(String(process.pid))

    release()
    expect(existsSync(lockPath(root))).toBe(false)
  })

  test("取っている間の2つめは待ち、外されてから取れる", async () => {
    const root = await createRepository()
    const release = await acquireCheckLock(root)

    const second = acquireCheckLock(root, TEST_POLL_INTERVAL_MS)
    expect(await isSettled(second, SETTLE_PROBE_MS)).toBe(false)

    release()
    const releaseSecond = await second
    expect(existsSync(lockPath(root))).toBe(true)
    releaseSecond()
  })

  test("持ち主が生きていない錠は待たずに奪う", async () => {
    const root = await createRepository()
    const child = spawn(process.execPath, ["-e", ""])
    const deadPid = child.pid
    await new Promise((resolve) => child.on("close", resolve))
    mkdirSync(lockPath(root))
    writeFileSync(join(lockPath(root), "pid"), String(deadPid))

    const release = await acquireCheckLock(root)

    expect(readFileSync(join(lockPath(root), "pid"), "utf8")).toBe(String(process.pid))
    release()
  })

  test("持ち主が環境で知らされた錠の中では取り直さず、外す関数も錠を消さない", async () => {
    const root = await createRepository()
    const release = await acquireCheckLock(root)

    const releaseInside = await acquireCheckLockUnlessHeld(root, withCheckLockOwner({}))
    releaseInside()

    expect(existsSync(lockPath(root))).toBe(true)
    release()
  })

  test("環境が別の持ち主を指すときは、錠が空くまで待つ", async () => {
    const root = await createRepository()
    const release = await acquireCheckLock(root)

    const waiting = acquireCheckLockUnlessHeld(
      root,
      { TSUKUMO_CHECK_LOCK_OWNER: "1" },
      TEST_POLL_INTERVAL_MS,
    )
    expect(await isSettled(waiting, SETTLE_PROBE_MS)).toBe(false)

    release()
    ;(await waiting)()
  })

  test("環境に持ち主が無ければ、錠が空いているとき通常どおり取る", async () => {
    const root = await createRepository()

    const release = await acquireCheckLockUnlessHeld(root, {})

    expect(existsSync(lockPath(root))).toBe(true)
    release()
    expect(existsSync(lockPath(root))).toBe(false)
  })
})
