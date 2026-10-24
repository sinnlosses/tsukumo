import { mkdirSync } from "node:fs"
import { join } from "node:path"

import { range } from "remeda"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import {
  createAchievementCache,
  readAchievement,
} from "../../../../src/server/achievement/adapter/closed-issue.ts"
import {
  CLOSED_TASK_DISPLAY_LIMIT,
  createBeadsStampReader,
  readBeadsIssues,
  readBeadsStampOf,
  readBeadsWorkspace,
} from "../../../../src/server/repository/adapter/beads.ts"
import type * as GitAdapter from "../../../../src/server/repository/adapter/git.ts"
import {
  bd,
  initBeads,
  initBeadsWithIssuesOutsideGit,
  useBeadsHome,
} from "../../../fixture/beads-repository.ts"
import {
  addWorktree,
  initBeadsIssues,
  initRepository,
  openIssue,
} from "../../../fixture/task-summary-repository.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

// 本物の `bd` を起こすテストはこのファイルだけに置く（ほかは取り込み口のフェイクで済ませる）。
// `HOME` は一時ディレクトリへ向け（`useBeadsHome`）、リポジトリは一時ディレクトリに毎回作り、中身は架空の課題だけにする。

// 本物の `bd` は負荷で5秒を超えうるので、製品の上限だけ延ばす。
vi.mock("../../../../src/server/repository/adapter/git.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof GitAdapter>()),
  GIT_TIMEOUT_MS: 60_000,
}))

const root = useTempDir("beads-issues-reader")
const home = useBeadsHome(() => join(root(), "home"))

const vcStatusSchema = z.object({ commit: z.string() })

function bodyOf(id: string): Readonly<Record<string, string>> {
  return {
    description: `${id} の架空の説明`,
    acceptance_criteria: `${id} の架空の受け入れ条件`,
    notes: `${id} の架空のメモ`,
  }
}

function closedAtOf(hour: number): string {
  return `2026-01-14T${String(hour).padStart(2, "0")}:00:00Z`
}

describe("readBeadsIssues", { timeout: 60_000 }, () => {
  it("全件を読み、本文は閉じていない課題と閉じた時刻の新しい課題にだけ付ける", async () => {
    const closedIds = range(1, CLOSED_TASK_DISPLAY_LIMIT + 2).map(
      (n) => `t-${String(n).padStart(3, "0")}`,
    )
    const repository = await initBeadsIssues(root(), [
      openIssue("t-100", "未着手", bodyOf("t-100")),
      ...closedIds.map((id, index) =>
        openIssue(id, `済み ${id}`, {
          ...bodyOf(id),
          status: "closed",
          closed_at: closedAtOf(index + 1),
        }),
      ),
    ])

    const outcome = await readBeadsIssues(repository, undefined)
    if (outcome.kind !== "issues") {
      throw new Error("読めるはず")
    }
    const byId = new Map(outcome.issues.map((issue) => [issue.id, issue]))
    const oldestId = "t-001"

    expect(byId.size).toBe(closedIds.length + 1)
    for (const id of ["t-100", ...closedIds.filter((closedId) => closedId !== oldestId)]) {
      expect(byId.get(id)).toMatchObject({
        description: `${id} の架空の説明`,
        acceptanceCriteria: `${id} の架空の受け入れ条件`,
        notes: `${id} の架空のメモ`,
      })
    }
    expect(byId.get(oldestId)).toMatchObject({
      title: `済み ${oldestId}`,
      closedAtEpochMilliseconds: Temporal.Instant.from(closedAtOf(1)).epochMilliseconds,
      description: "",
      acceptanceCriteria: "",
      notes: "",
    })
  })
})

describe("createBeadsStampReader", { timeout: 60_000 }, () => {
  it("課題を書き換えると変わり、書き換えなければ変わらない", async () => {
    const repository = await initBeadsIssues(root(), [openIssue("t-001", "架空")])
    const readStamp = createBeadsStampReader(repository)

    const before = await readStamp()
    const unchanged = await readStamp()
    await bd(repository, home(), "update", "t-001", "--claim")
    const after = await readStamp()

    expect(before).toMatchObject({ kind: "present", stamp: expect.any(String) })
    expect(unchanged).toEqual(before)
    expect(after).not.toEqual(before)
  })

  it("別の作業ツリーからの書き換えでも変わる", async () => {
    const repository = await initBeadsIssues(root(), [openIssue("t-001", "架空")])
    const worktree = await addWorktree(root(), repository)
    const readStamp = createBeadsStampReader(worktree)

    const before = await readStamp()
    await bd(worktree, home(), "update", "t-001", "--claim")

    expect(before).toMatchObject({ kind: "present", stamp: expect.any(String) })
    expect(await readStamp()).not.toEqual(before)
  })

  it(".beads が無ければ missing", async () => {
    const repository = await initRepository(root())

    expect(await createBeadsStampReader(repository)()).toEqual({ kind: "missing" })
  })
})

describe("readBeadsStampOf", { timeout: 60_000 }, () => {
  it("印は bd vc status の commit", async () => {
    const repository = await initBeadsIssues(root(), [openIssue("t-001", "架空")])

    const status = vcStatusSchema.parse(
      JSON.parse(await bd(repository, home(), "vc", "status", "--json")),
    )

    expect(await readBeadsStampOf(repository)).toBe(status.commit)
  })

  it("課題を読むだけでは変わらず、コメントを足すと変わる", async () => {
    const repository = await initBeadsIssues(root(), [openIssue("t-001", "架空")])
    const before = await readBeadsStampOf(repository)

    await bd(repository, home(), "list", "--json", "--all")
    await bd(repository, home(), "show", "t-001")
    const afterRead = await readBeadsStampOf(repository)
    await bd(repository, home(), "comment", "t-001", "架空のコメント")

    expect(before).toEqual(expect.any(String))
    expect(afterRead).toBe(before)
    expect(await readBeadsStampOf(repository)).not.toBe(before)
  })

  it(".beads が無いと bd が落ちるので undefined", async () => {
    const repository = await initRepository(root())

    expect(await readBeadsStampOf(repository)).toBeUndefined()
  })
})

describe("readBeadsWorkspace", { timeout: 60_000 }, () => {
  it(".beads があればその場所を返す", async () => {
    const repository = await initRepository(root())
    initBeads(repository)

    expect(await readBeadsWorkspace(repository)).toEqual({
      kind: "found",
      dir: expect.stringMatching(/\.beads$/),
    })
  })

  it(".beads が無ければ missing", async () => {
    const repository = await initRepository(root())

    expect(await readBeadsWorkspace(repository)).toEqual({ kind: "missing" })
  })
})

describe("readAchievement", { timeout: 60_000 }, () => {
  it("git リポジトリでなくても .beads があれば終えたタスクを数える", async () => {
    const dir = join(root(), "outside-git")
    mkdirSync(dir, { recursive: true })
    await initBeadsWithIssuesOutsideGit(dir, [
      openIssue("t-001", "今日済んだ", {
        status: "closed",
        closed_at: "2026-09-23T18:00:00Z",
      }),
    ])

    const result = await readAchievement(
      "2026-09-23",
      "2026-09-24",
      createAchievementCache(dir, () => 0),
    )

    expect(result).toMatchObject({
      kind: "ok",
      achievement: { kind: "known", doneTasks: [{ id: "t-001", summary: "今日済んだ" }] },
    })
  })
})
