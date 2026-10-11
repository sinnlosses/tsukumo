import { mkdir, utimes, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  createBeadsStampReader,
  readBeadsStampOf,
  readBeadsWorkspace,
} from "../../../../src/server/repository/adapter/beads.ts"
import { bd, initBeads, useBeadsHome } from "../../../fixture/beads-repository.ts"
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

    expect(before).toMatchObject({ kind: "present", stamp: expect.any(String) })
    expect(unchanged).toEqual(before)
    expect(after).not.toEqual(before)
  })

  it("別の作業ツリーからの書き換えでも変わる", { timeout: 60_000 }, async () => {
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

describe("readBeadsStampOf", () => {
  async function writeManifest(beadsDir: string, content: string): Promise<string> {
    const nomsDir = join(beadsDir, "embeddeddolt", "t", ".dolt", "noms")
    await mkdir(nomsDir, { recursive: true })
    const manifest = join(nomsDir, "manifest")
    await writeFile(manifest, content)
    return manifest
  }

  it("中身が同じなら、更新時刻だけ進んでも印は変わらない", async () => {
    const manifest = await writeManifest(root(), "5:__DOLT__:root-1")
    const before = await readBeadsStampOf(root())

    await utimes(manifest, 1_000, 2_000)

    expect(before).toEqual(expect.any(String))
    expect(await readBeadsStampOf(root())).toBe(before)
  })

  it("中身が書き変わると印が変わる", async () => {
    await writeManifest(root(), "5:__DOLT__:root-1")
    const before = await readBeadsStampOf(root())

    await writeManifest(root(), "5:__DOLT__:root-2")

    expect(await readBeadsStampOf(root())).not.toBe(before)
  })

  it("embeddeddolt・データベース・manifest のどれかが無ければ undefined", async () => {
    expect(await readBeadsStampOf(root())).toBeUndefined()

    await mkdir(join(root(), "embeddeddolt"), { recursive: true })
    expect(await readBeadsStampOf(root())).toBeUndefined()

    await mkdir(join(root(), "embeddeddolt", "t"), { recursive: true })
    expect(await readBeadsStampOf(root())).toBeUndefined()
  })
})

describe("readBeadsWorkspace", () => {
  it(".beads があればその場所を返す", { timeout: 60_000 }, async () => {
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
