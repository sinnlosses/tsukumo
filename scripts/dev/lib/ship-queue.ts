// 送り出しの列という概念を持つ。枝を積む・先頭から1件ずつ送る・落ちた理由を記録に残す・送る処理を1つに絞る錠。
// git・pnpm は呼ばず、枝1件を送る処理と置き場は呼び出し元が渡す。

import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"

import type { ShipPlanResult } from "./ship-plan.ts"
import type { ShipReviewOutcome } from "./ship-review.ts"

const ENTRY_SUFFIX = ".entry"
const RECORD_FILE_NAME = "records.jsonl"
const LOCK_FILE_NAME = "drain.lock"
const ENTRY_TIME_DIGITS = 16

export type ShipQueueEntry = {
  readonly id: string
  readonly branch: string
}

export type VerifyVerdict = "not-run" | "passed" | "flaky" | "real"

export type ShipEntryOutcome = ShipPlanResult["outcome"] | "worktree-missing"

export type ShippedEntry = {
  readonly outcome: ShipEntryOutcome
  readonly reason: string
  readonly verify: VerifyVerdict
}

/** 列の記録の1行。送れなかった枝と、打ち直しで通った（`flaky`）枝だけを残す。 */
export type ShipQueueRecord = ShippedEntry & {
  readonly at: string
  readonly branch: string
}

export type ShipQueue = {
  readonly enqueue: (branch: string) => "queued" | "already-queued"
  /** 積んだ順。 */
  readonly entries: () => readonly ShipQueueEntry[]
  readonly remove: (entry: ShipQueueEntry) => void
  readonly record: (record: ShipQueueRecord) => void
}

export type DrainLock =
  | { readonly kind: "acquired"; readonly release: () => void }
  | { readonly kind: "held"; readonly owner: number }

export type DrainResult =
  | { readonly kind: "running"; readonly owner: number }
  | { readonly kind: "drained"; readonly shipped: readonly ShipQueueRecord[] }

export type EnqueueHooks = {
  readonly hasOpenClaim: () => boolean
  readonly isOwnWorktreeClean: () => boolean
  readonly review: () => ShipReviewOutcome
  readonly enqueue: () => "queued" | "already-queued"
}

export type EnqueueResult =
  | { readonly outcome: "queued" }
  | { readonly outcome: "already-queued" }
  | Extract<
      ShipPlanResult,
      {
        readonly outcome:
          | "task-claimed"
          | "own-worktree-dirty"
          | "review-rejected"
          | "review-exhausted"
          | "review-unavailable"
      }
    >

/** 着手中のタスク・未コミットの変更・受け入れを確かめてから積む。 */
export function enqueueAfterReview(hooks: EnqueueHooks): EnqueueResult {
  if (hooks.hasOpenClaim()) {
    return { outcome: "task-claimed" }
  }
  if (!hooks.isOwnWorktreeClean()) {
    return { outcome: "own-worktree-dirty" }
  }
  const review = hooks.review()
  switch (review.kind) {
    case "rejected":
      return { outcome: "review-rejected", findings: review.findings }
    case "exhausted":
      return { outcome: "review-exhausted", findings: review.findings }
    case "unavailable":
      return { outcome: "review-unavailable", reason: review.reason }
    case "skipped":
    case "passed":
      return { outcome: hooks.enqueue() }
  }
}

/**
 * 錠を取り、列が空になるまで先頭から1件ずつ `shipEntry` で送る。送れなくても列から外して記録に残し、次へ進む。
 * 錠を放したあとに積まれた枝を取りこぼさないよう、放したあとも列が空でなければ取り直す。 */
export function drainShipQueue(
  queue: ShipQueue,
  acquireLock: () => DrainLock,
  shipEntry: (branch: string) => ShippedEntry,
  now: () => string,
): DrainResult {
  const shipped: ShipQueueRecord[] = []
  do {
    const lock = acquireLock()
    if (lock.kind === "held") {
      return shipped.length === 0
        ? { kind: "running", owner: lock.owner }
        : { kind: "drained", shipped }
    }
    try {
      for (let entry = queue.entries()[0]; entry !== undefined; entry = queue.entries()[0]) {
        const record = { at: now(), branch: entry.branch, ...shipEntry(entry.branch) }
        queue.remove(entry)
        if (record.outcome !== "ok" || record.verify === "flaky") {
          queue.record(record)
        }
        shipped.push(record)
      }
    } finally {
      lock.release()
    }
  } while (queue.entries().length > 0)
  return { kind: "drained", shipped }
}

/** 検証を打ち、落ちたら1回だけ打ち直して、通ったか・揺らぎか・本当に落ちたかを判定する。 */
export function verifyWithRetry(runVerify: () => number): {
  readonly status: number
  readonly verdict: Exclude<VerifyVerdict, "not-run">
} {
  if (runVerify() === 0) {
    return { status: 0, verdict: "passed" }
  }
  const status = runVerify()
  return { status, verdict: status === 0 ? "flaky" : "real" }
}

/** `directory` の下に、枝1件を1ファイルで積む列を置く。ファイル名の先頭の時刻で積んだ順に並ぶ。 */
export function createShipQueue(directory: string, nowMs: () => number): ShipQueue {
  const entries = (): readonly ShipQueueEntry[] =>
    listDirectory(directory)
      .filter((name) => name.endsWith(ENTRY_SUFFIX))
      .toSorted()
      .flatMap((id) => {
        const branch = readText(join(directory, id))?.trim() ?? ""
        return branch === "" ? [] : [{ id, branch }]
      })
  return {
    enqueue: (branch) => {
      if (entries().some((entry) => entry.branch === branch)) {
        return "already-queued"
      }
      mkdirSync(directory, { recursive: true })
      for (let time = nowMs(); ; time += 1) {
        const id = `${String(time).padStart(ENTRY_TIME_DIGITS, "0")}-${encodeURIComponent(branch)}${ENTRY_SUFFIX}`
        if (writeExclusively(join(directory, id), `${branch}\n`)) {
          return "queued"
        }
      }
    },
    entries,
    remove: (entry) => {
      rmSync(join(directory, entry.id), { force: true })
    },
    record: (record) => {
      mkdirSync(directory, { recursive: true })
      appendFileSync(join(directory, RECORD_FILE_NAME), `${JSON.stringify(record)}\n`)
    },
  }
}

/** `directory` の錠を取る。持ち主が死んでいれば奪う。 */
export function tryAcquireDrainLock(
  directory: string,
  pid: number,
  isAlive: (pid: number) => boolean,
): DrainLock {
  const lockPath = join(directory, LOCK_FILE_NAME)
  mkdirSync(directory, { recursive: true })
  if (!writeExclusively(lockPath, `${String(pid)}\n`)) {
    const owner = Number.parseInt(readText(lockPath) ?? "", 10)
    if (Number.isInteger(owner) && owner > 0 && isAlive(owner)) {
      return { kind: "held", owner }
    }
    rmSync(lockPath, { force: true })
    if (!writeExclusively(lockPath, `${String(pid)}\n`)) {
      return { kind: "held", owner: Number.parseInt(readText(lockPath) ?? "0", 10) }
    }
  }
  return {
    kind: "acquired",
    release: () => {
      if (Number.parseInt(readText(lockPath) ?? "", 10) === pid) {
        rmSync(lockPath, { force: true })
      }
    },
  }
}

function writeExclusively(path: string, text: string): boolean {
  try {
    writeFileSync(path, text, { flag: "wx" })
    return true
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      return false
    }
    throw error
  }
}

function listDirectory(directory: string): readonly string[] {
  try {
    return readdirSync(directory)
  } catch {
    return []
  }
}

function readText(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}
