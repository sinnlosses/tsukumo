import { describe, expect, it } from "bun:test"

import {
  decideTaskMark,
  readTaskMark,
  type TaskMark,
  taskClaimNotice,
  writeTaskMark,
} from "../../../src/server/core/task-claim.ts"

const MARK: TaskMark = {
  taskId: "T-351",
  pid: 1234,
  claimedAt: "2026-09-22T15:30:12+09:00",
  workdir: {
    kind: "worktree",
    path: "/repo/.git/tsukumo/worktree/20260922-153012",
    branch: "tsukumo/20260922-153012",
    origin: "/repo",
  },
}

describe("decideTaskMark", () => {
  it("生きているセッションの印は触らない", () => {
    expect(decideTaskMark({ kind: "found", mark: MARK, running: true })).toEqual({ kind: "held" })
  })

  it("pid が生きていない印は掃除する", () => {
    expect(decideTaskMark({ kind: "found", mark: MARK, running: false })).toEqual({ kind: "stale" })
  })

  it("読めない印も掃除する（読めないものを残すと誰もそのタスクを取れない）", () => {
    expect(decideTaskMark({ kind: "unreadable" })).toEqual({ kind: "stale" })
  })
})

describe("writeTaskMark / readTaskMark", () => {
  it("書いた印をそのまま読み直せる", () => {
    expect(readTaskMark(writeTaskMark(MARK))).toEqual(MARK)
  })

  it("切っていないセッションの印も読み直せる", () => {
    const direct: TaskMark = { ...MARK, workdir: { kind: "direct", path: "/repo" } }

    expect(readTaskMark(writeTaskMark(direct))).toEqual(direct)
  })

  it("会話の内容が混ざる余地のある鍵は読まない（書いた4つだけ）", () => {
    const written = JSON.stringify({ ...MARK, text: "会話の内容" })

    expect(readTaskMark(written)).toEqual(MARK)
  })

  it("JSON として読めない印は undefined", () => {
    expect(readTaskMark("1234\n")).toBeUndefined()
    expect(readTaskMark("{")).toBeUndefined()
  })

  it("形の違う印は undefined（タスクid・pid・作業先のどれが欠けても読まない）", () => {
    expect(readTaskMark(JSON.stringify({ ...MARK, taskId: "" }))).toBeUndefined()
    expect(readTaskMark(JSON.stringify({ ...MARK, pid: "1234" }))).toBeUndefined()
    expect(readTaskMark(JSON.stringify({ ...MARK, pid: 0 }))).toBeUndefined()
    expect(readTaskMark(JSON.stringify({ ...MARK, workdir: { kind: "direct" } }))).toBeUndefined()
    expect(
      readTaskMark(JSON.stringify({ ...MARK, workdir: { kind: "worktree", path: "/repo" } })),
    ).toBeUndefined()
  })
})

describe("taskClaimNotice", () => {
  it("取れた回は、着手してよいとタスクidつきで言い切る", () => {
    expect(taskClaimNotice({ kind: "claimed", mark: MARK })).toBe(
      "T-351 の着手の印を取った（着手してよい）",
    )
  })

  it("取れなかった回は着手しないと言い切り、先に取っているセッションを並べる", () => {
    const notice = taskClaimNotice({ kind: "held", by: MARK })

    expect(notice).toContain("T-351 は別のセッションが取っている（着手しない）")
    expect(notice).toContain("pid 1234")
    expect(notice).toContain("2026-09-22T15:30:12+09:00")
    expect(notice).toContain("/repo/.git/tsukumo/worktree/20260922-153012")
  })

  it("印を置けなかった回も着手しない側へ倒し、理由を添える", () => {
    const notice = taskClaimNotice({ kind: "failed", reason: "着手の印を置けなかった: /repo/.git" })

    expect(notice).toContain("着手しない")
    expect(notice).toContain("/repo/.git")
  })
})
