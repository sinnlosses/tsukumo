import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import process from "node:process"

import { claimTask, releaseTask } from "../../../src/server/adapter/mark.ts"
import { type TaskMark, writeTaskMark } from "../../../src/server/core/task-claim.ts"
import { type Workdir } from "../../../src/shared/workspace.ts"

// 印は `.git` の下（バージョン管理の外）に置く。**tsukumo 自身のリポジトリには触らない**ので、
// 使い捨ての一時ディレクトリを `.git` に見立てる（`git` を起こすのは `worktree.ts` の仕事で、
// ここは受け取った絶対パスの下を読み書きするだけ）。
let dir: string
let gitDir: string

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "tsukumo-mark-")))
  gitDir = join(dir, ".git")
  mkdirSync(gitDir, { recursive: true })
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const WORKDIR: Workdir = {
  kind: "worktree",
  path: "/repo/.git/tsukumo/worktree/20260922-153012",
  branch: "tsukumo/20260922-153012",
  origin: "/repo",
}

/** 落ちたセッションが残した印（pid が生きていない）。 */
function leaveStaleMark(taskId: string): string {
  const path = join(gitDir, "tsukumo", "claim", taskId)
  const mark: TaskMark = {
    taskId,
    pid: 999999999,
    claimedAt: "2026-09-22T15:30:12+09:00",
    workdir: WORKDIR,
  }
  mkdirSync(join(gitDir, "tsukumo", "claim"), { recursive: true })
  writeFileSync(path, writeTaskMark(mark), "utf8")
  return path
}

describe("claimTask", () => {
  it("誰も取っていないタスクは取れ、印がタスクidの名前で置かれる", async () => {
    const claim = await claimTask({ gitDir, taskId: "T-351", workdir: WORKDIR })

    expect(claim.kind).toBe("claimed")
    expect(claim.kind === "claimed" ? claim.mark.pid : undefined).toBe(process.pid)
    expect(existsSync(join(gitDir, "tsukumo", "claim", "T-351"))).toBe(true)
  })

  it("同じタスクidを2回続けて取りに行くと、2回目は取れない", async () => {
    const first = await claimTask({ gitDir, taskId: "T-351", workdir: WORKDIR })

    const second = await claimTask({ gitDir, taskId: "T-351", workdir: WORKDIR })

    expect(first.kind).toBe("claimed")
    expect(second.kind).toBe("held")
    // 取れなかった側には、先に取っているセッションの印がそのまま返る。
    expect(second.kind === "held" ? second.by.pid : undefined).toBe(process.pid)
    expect(second.kind === "held" ? second.by.workdir : undefined).toEqual(WORKDIR)
  })

  it("pid が生きていない印は掃除され、そのタスクは取り直せる", async () => {
    const path = leaveStaleMark("T-351")

    const claim = await claimTask({ gitDir, taskId: "T-351", workdir: WORKDIR })

    expect(claim.kind).toBe("claimed")
    expect(claim.kind === "claimed" ? claim.mark.pid : undefined).toBe(process.pid)
    expect(existsSync(path)).toBe(true)
  })

  it("他のタスクに残った、pid が生きていない印も取りに来たセッションが掃除する", async () => {
    const path = leaveStaleMark("T-999")

    await claimTask({ gitDir, taskId: "T-351", workdir: WORKDIR })

    expect(existsSync(path)).toBe(false)
  })

  it("読めない印は掃除され、取りに来たセッションが取れる", async () => {
    mkdirSync(join(gitDir, "tsukumo", "claim"), { recursive: true })
    writeFileSync(join(gitDir, "tsukumo", "claim", "T-351"), "書きかけ", "utf8")

    const claim = await claimTask({ gitDir, taskId: "T-351", workdir: WORKDIR })

    expect(claim.kind).toBe("claimed")
  })

  it("置き場を作れなければ取れない（理由を付けて失敗を返す）", async () => {
    // `.git` の位置にファイルがあると、その下にディレクトリを作れない。
    const blocked = join(dir, "not-a-dir")
    writeFileSync(blocked, "", "utf8")

    const claim = await claimTask({ gitDir: blocked, taskId: "T-351", workdir: WORKDIR })

    expect(claim.kind).toBe("failed")
    expect(claim.kind === "failed" ? claim.reason : "").toContain("T-351")
  })
})

describe("releaseTask", () => {
  it("返した印は消え、次のセッションが取れる", async () => {
    await claimTask({ gitDir, taskId: "T-351", workdir: WORKDIR })

    await releaseTask({ gitDir, taskId: "T-351" })

    expect(existsSync(join(gitDir, "tsukumo", "claim", "T-351"))).toBe(false)
    expect((await claimTask({ gitDir, taskId: "T-351", workdir: WORKDIR })).kind).toBe("claimed")
  })

  it("他のセッションが取った印には触らない", async () => {
    const path = join(gitDir, "tsukumo", "claim", "T-351")
    mkdirSync(join(gitDir, "tsukumo", "claim"), { recursive: true })
    const mark: TaskMark = {
      taskId: "T-351",
      // 自分ではない、生きている pid（このテストのプロセスの親）。
      pid: process.ppid,
      claimedAt: "2026-09-22T15:30:12+09:00",
      workdir: WORKDIR,
    }
    writeFileSync(path, writeTaskMark(mark), "utf8")

    await releaseTask({ gitDir, taskId: "T-351" })

    expect(existsSync(path)).toBe(true)
  })
})

describe("印の置き場", () => {
  it("置いた印は git status に出ない（`.git` の下だから）", async () => {
    const root = join(dir, "repo")
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, "README.md"), "# 架空のリポジトリ\n")
    execFileSync("git", ["init", "-q", "."], { cwd: root })

    await claimTask({ gitDir: join(root, ".git"), taskId: "T-351", workdir: WORKDIR })

    expect(existsSync(join(root, ".git", "tsukumo", "claim", "T-351"))).toBe(true)
    expect(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" })).toBe(
      "?? README.md\n",
    )
  })
})
