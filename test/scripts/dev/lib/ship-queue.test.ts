// 送り出しの列を一時ディレクトリの実物のファイルで、積む・先頭から送る・落ちた記録・錠・受け入れの門を検証する。

import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, test } from "vitest"

import {
  createShipQueue,
  drainShipQueue,
  enqueueAfterReview,
  tryAcquireDrainLock,
  verifyWithRetry,
  type EnqueueHooks,
  type ShippedEntry,
  type ShipQueue,
} from "../../../../scripts/dev/lib/ship-queue.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const AT = "2026-10-27T00:00:00Z"
const OWN_PID = 100
const OTHER_PID = 200
const SHIPPED: ShippedEntry = { outcome: "ok", reason: "", verify: "passed" }

describe("ship-queue", () => {
  const tempDir = useTempDir("ship-queue")

  function queueAt(start = 1_000): ShipQueue {
    let time = start
    return createShipQueue(tempDir(), () => time++)
  }

  function readRecords(): readonly unknown[] {
    return readFileSync(join(tempDir(), "records.jsonl"), "utf8")
      .split("\n")
      .filter((line) => line !== "")
      .map((line): unknown => JSON.parse(line))
  }

  function ownLock() {
    return () => tryAcquireDrainLock(tempDir(), OWN_PID, () => false)
  }

  describe("createShipQueue", () => {
    test("枝を1件1ファイルで積み、積んだ順に返す", () => {
      const queue = queueAt()
      expect(queue.enqueue("feature/b")).toBe("queued")
      expect(queue.enqueue("a")).toBe("queued")
      expect(queue.entries().map((entry) => entry.branch)).toEqual(["feature/b", "a"])
      expect(readdirSync(tempDir()).filter((name) => name.endsWith(".entry"))).toHaveLength(2)
    })

    test("同じ枝は2度積まない", () => {
      const queue = queueAt()
      queue.enqueue("a")
      expect(queue.enqueue("a")).toBe("already-queued")
      expect(queue.entries()).toHaveLength(1)
    })

    test("同じ時刻に積んでもファイルが重ならない", () => {
      const queue = createShipQueue(tempDir(), () => 5)
      queue.enqueue("a")
      queue.enqueue("b")
      expect(queue.entries().map((entry) => entry.branch)).toEqual(["a", "b"])
    })

    test("置き場がまだ無ければ空の列", () => {
      expect(createShipQueue(join(tempDir(), "missing"), () => 0).entries()).toEqual([])
    })
  })

  describe("enqueueAfterReview", () => {
    function hooks(overrides: Partial<EnqueueHooks>, calls: string[]): EnqueueHooks {
      return {
        hasOpenClaim: () => (calls.push("hasOpenClaim"), overrides.hasOpenClaim?.() ?? false),
        isOwnWorktreeClean: () => (
          calls.push("isOwnWorktreeClean"),
          overrides.isOwnWorktreeClean?.() ?? true
        ),
        review: () => (calls.push("review"), overrides.review?.() ?? { kind: "passed" }),
        enqueue: () => (calls.push("enqueue"), overrides.enqueue?.() ?? "queued"),
      }
    }

    test("受け入れが通ってから積む", () => {
      const calls: string[] = []
      expect(enqueueAfterReview(hooks({}, calls))).toEqual({ outcome: "queued" })
      expect(calls).toEqual(["hasOpenClaim", "isOwnWorktreeClean", "review", "enqueue"])
    })

    test("受け入れ役が差し戻したら積まない", () => {
      const calls: string[] = []
      const result = enqueueAfterReview(
        hooks({ review: () => ({ kind: "rejected", findings: ["x"] }) }, calls),
      )
      expect(result).toEqual({ outcome: "review-rejected", findings: ["x"] })
      expect(calls).not.toContain("enqueue")
    })

    test("未コミットの変更があれば受け入れ役を起こさない", () => {
      const calls: string[] = []
      expect(enqueueAfterReview(hooks({ isOwnWorktreeClean: () => false }, calls))).toEqual({
        outcome: "own-worktree-dirty",
      })
      expect(calls).toEqual(["hasOpenClaim", "isOwnWorktreeClean"])
    })
  })

  describe("drainShipQueue", () => {
    test("先頭から1件ずつ送り、送った枝を列から外す", () => {
      const queue = queueAt()
      queue.enqueue("a")
      queue.enqueue("b")
      const order: string[] = []
      const result = drainShipQueue(
        queue,
        ownLock(),
        (branch) => (order.push(branch), SHIPPED),
        () => AT,
      )
      expect(order).toEqual(["a", "b"])
      expect(result.kind).toBe("drained")
      expect(queue.entries()).toEqual([])
    })

    test("落ちた枝は理由を記録に残して外し、次の枝へ進む", () => {
      const queue = queueAt()
      queue.enqueue("a")
      queue.enqueue("b")
      const failed: ShippedEntry = {
        outcome: "verify-failed",
        reason: "pnpm run check --full が終了コード 1 で落ちた",
        verify: "real",
      }
      drainShipQueue(
        queue,
        ownLock(),
        (branch) => (branch === "a" ? failed : SHIPPED),
        () => AT,
      )
      expect(readRecords()).toEqual([{ at: AT, branch: "a", ...failed }])
      expect(queue.entries()).toEqual([])
    })

    test("打ち直しで通った枝は送ったうえで flaky として記録に残す", () => {
      const queue = queueAt()
      queue.enqueue("a")
      const flaky: ShippedEntry = { outcome: "ok", reason: "", verify: "flaky" }
      drainShipQueue(
        queue,
        ownLock(),
        () => flaky,
        () => AT,
      )
      expect(readRecords()).toEqual([{ at: AT, branch: "a", ...flaky }])
    })

    test("送っている間に積まれた枝も同じ drain が送る", () => {
      const queue = queueAt()
      queue.enqueue("a")
      const order: string[] = []
      drainShipQueue(
        queue,
        ownLock(),
        (branch) => {
          order.push(branch)
          if (branch === "a") {
            queue.enqueue("b")
          }
          return SHIPPED
        },
        () => AT,
      )
      expect(order).toEqual(["a", "b"])
    })

    test("錠を放した直後に積まれた枝も、取り直して送る", () => {
      const queue = queueAt()
      queue.enqueue("a")
      const order: string[] = []
      let acquired = 0
      drainShipQueue(
        queue,
        () => {
          const lock = tryAcquireDrainLock(tempDir(), OWN_PID, () => false)
          acquired += 1
          if (lock.kind !== "acquired") {
            return lock
          }
          return {
            kind: "acquired",
            release: () => {
              lock.release()
              if (acquired === 1) {
                queue.enqueue("b")
              }
            },
          }
        },
        (branch) => (order.push(branch), SHIPPED),
        () => AT,
      )
      expect(order).toEqual(["a", "b"])
      expect(acquired).toBe(2)
    })

    test("別の drain が錠を持っていれば何も送らず、持ち主を返す", () => {
      const queue = queueAt()
      queue.enqueue("a")
      tryAcquireDrainLock(tempDir(), OTHER_PID, () => true)
      const result = drainShipQueue(
        queue,
        () => tryAcquireDrainLock(tempDir(), OWN_PID, (pid) => pid === OTHER_PID),
        () => {
          throw new Error("送らないはず")
        },
        () => AT,
      )
      expect(result).toEqual({ kind: "running", owner: OTHER_PID })
      expect(queue.entries()).toHaveLength(1)
    })

    test("送るのが例外で止まっても錠は放す", () => {
      const queue = queueAt()
      queue.enqueue("a")
      expect(() =>
        drainShipQueue(
          queue,
          ownLock(),
          () => {
            throw new Error("止まった")
          },
          () => AT,
        ),
      ).toThrow("止まった")
      expect(tryAcquireDrainLock(tempDir(), OTHER_PID, () => true).kind).toBe("acquired")
    })
  })

  describe("tryAcquireDrainLock", () => {
    test("持ち主が死んでいれば奪う", () => {
      writeFileSync(join(tempDir(), "drain.lock"), `${String(OTHER_PID)}\n`)
      expect(tryAcquireDrainLock(tempDir(), OWN_PID, () => false).kind).toBe("acquired")
      expect(readFileSync(join(tempDir(), "drain.lock"), "utf8")).toBe(`${String(OWN_PID)}\n`)
    })

    test("放すのは自分が持っている錠だけ", () => {
      const lock = tryAcquireDrainLock(tempDir(), OWN_PID, () => false)
      writeFileSync(join(tempDir(), "drain.lock"), `${String(OTHER_PID)}\n`)
      if (lock.kind !== "acquired") {
        throw new Error("錠が取れなかった")
      }
      lock.release()
      expect(readFileSync(join(tempDir(), "drain.lock"), "utf8")).toBe(`${String(OTHER_PID)}\n`)
    })
  })

  describe("verifyWithRetry", () => {
    function runs(statuses: readonly number[]): () => number {
      const queue = [...statuses]
      return () => queue.shift() ?? 99
    }

    test("1回で通れば打ち直さない", () => {
      expect(verifyWithRetry(runs([0, 1]))).toEqual({ status: 0, verdict: "passed" })
    })

    test("落ちて打ち直しで通れば flaky", () => {
      expect(verifyWithRetry(runs([1, 0]))).toEqual({ status: 0, verdict: "flaky" })
    })

    test("打ち直しでも落ちれば real で、打ち直しの終了コードを返す", () => {
      expect(verifyWithRetry(runs([1, 2]))).toEqual({ status: 2, verdict: "real" })
    })
  })
})
