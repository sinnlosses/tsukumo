import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, test } from "vitest"

import {
  acquireLock,
  LockWaitTimeoutError,
  type LockEnvironment,
} from "../../../scripts/dev/lib/e2e-full-lock.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

const tempDir = useTempDir("e2e-full-lock")

function fakeEnvironment(overrides: Partial<LockEnvironment>, notices: string[]): LockEnvironment {
  let clock = 0
  return {
    pid: 100,
    isAlive: () => true,
    now: () => clock,
    sleep: (milliseconds) => {
      clock += milliseconds
      return Promise.resolve()
    },
    notify: (line) => notices.push(line),
    ...overrides,
  }
}

describe("E2E 全件の錠", () => {
  test("錠が無ければ自分の pid で取り、解放すると消える", async () => {
    const lockPath = join(tempDir(), "lock")
    const release = await acquireLock(lockPath, fakeEnvironment({}, []))
    expect(readFileSync(lockPath, "utf8").trim()).toBe("100")
    release()
    expect(existsSync(lockPath)).toBe(false)
  })

  test("持ち主が死んでいる錠は奪う", async () => {
    const lockPath = join(tempDir(), "lock")
    writeFileSync(lockPath, "999\n")
    const release = await acquireLock(
      lockPath,
      fakeEnvironment({ isAlive: (pid) => pid !== 999 }, []),
    )
    expect(readFileSync(lockPath, "utf8").trim()).toBe("100")
    release()
  })

  test("持ち主が生きている間は待ち、待っていることを1行出す。持ち主が解放すれば取れる", async () => {
    const lockPath = join(tempDir(), "lock")
    writeFileSync(lockPath, "999\n")
    const notices: string[] = []
    let sleeps = 0
    const release = await acquireLock(
      lockPath,
      fakeEnvironment(
        {
          sleep: () => {
            sleeps += 1
            if (sleeps === 3) {
              rmSync(lockPath)
            }
            return Promise.resolve()
          },
        },
        notices,
      ),
    )
    expect(notices).toHaveLength(1)
    expect(notices[0]).toContain("pid 999")
    expect(readFileSync(lockPath, "utf8").trim()).toBe("100")
    release()
  })

  test("待ちが上限を超えたら錠を取らずに理由つきで諦める", async () => {
    const lockPath = join(tempDir(), "lock")
    writeFileSync(lockPath, "999\n")
    const rejected = acquireLock(lockPath, fakeEnvironment({}, []), 10_000)
    await expect(rejected).rejects.toBeInstanceOf(LockWaitTimeoutError)
    await expect(rejected).rejects.toThrow("pid 999")
    await expect(rejected).rejects.toThrow(lockPath)
    expect(readFileSync(lockPath, "utf8").trim()).toBe("999")
  })

  test("他人の錠は解放で消さない", async () => {
    const lockPath = join(tempDir(), "lock")
    const release = await acquireLock(lockPath, fakeEnvironment({}, []))
    writeFileSync(lockPath, "777\n")
    release()
    expect(readFileSync(lockPath, "utf8").trim()).toBe("777")
  })

  test("壊れた錠は続けて読めなければ消して取る", async () => {
    const lockPath = join(tempDir(), "lock")
    writeFileSync(lockPath, "garbage")
    const release = await acquireLock(lockPath, fakeEnvironment({}, []))
    expect(readFileSync(lockPath, "utf8").trim()).toBe("100")
    release()
  })
})
