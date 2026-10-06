import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  createBeadsStampReader,
  readBeadsWorkspace,
} from "../../../../src/server/repository/adapter/beads.ts"
import { bd, useBeadsHome } from "../../../fixture/beads-repository.ts"
import {
  initRepository,
  addWorktree,
  initBeadsIssues,
  openIssue,
} from "../../../fixture/task-summary-repository.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

// 本物の `bd` を、`HOME` を一時ディレクトリへ向けて起こす（`useBeadsHome`）。
// リポジトリは一時ディレクトリに毎回作り、中身は架空の課題だけにする。

const root = useTempDir("beads-stamp-reader")
const home = useBeadsHome(() => join(root(), "home"))

describe("createBeadsStampReader", () => {
  it("課題を書き換えると変わり、書き換えなければ変わらない", { timeout: 60_000 }, async () => {
    const repository = await initBeadsIssues(root(), [openIssue("t-001", "架空")])
    const readStamp = createBeadsStampReader(repository)

    const before = await readStamp()
    const unchanged = await readStamp()
    await bd(repository, home(), "update", "t-001", "--claim")
    const after = await readStamp()

    expect(before).toBeDefined()
    expect(unchanged).toBe(before)
    expect(after).not.toBe(before)
  })

  it("別の作業ツリーからの書き換えでも変わる", { timeout: 60_000 }, async () => {
    const repository = await initBeadsIssues(root(), [openIssue("t-001", "架空")])
    const worktree = await addWorktree(root(), repository)
    const readStamp = createBeadsStampReader(worktree)

    const before = await readStamp()
    await bd(worktree, home(), "update", "t-001", "--claim")

    expect(before).toBeDefined()
    expect(await readStamp()).not.toBe(before)
  })

  it(".beads が無ければ取れない（undefined）", async () => {
    const repository = await initRepository(root())

    expect(await createBeadsStampReader(repository)()).toBeUndefined()
  })
})

describe("readBeadsWorkspace", () => {
  it(".beads があればその場所を返す", { timeout: 60_000 }, async () => {
    const repository = await initBeadsIssues(root(), [openIssue("t-001", "架空")])

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
