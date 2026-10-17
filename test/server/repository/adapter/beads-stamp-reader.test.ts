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

  describe("dolt sql-server の置き場（dolt）", () => {
    // server では書いても manifest の中身が変わらず、chunk journal だけが伸びる（bd 1.3.1 を実測）。
    const JOURNAL_FILE = "vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv"

    async function writeServerData(
      beadsDir: string,
      manifest: string,
      journal: string | undefined,
    ): Promise<string | undefined> {
      const nomsDir = join(beadsDir, "dolt", "t", ".dolt", "noms")
      await mkdir(nomsDir, { recursive: true })
      await writeFile(join(nomsDir, "manifest"), manifest)
      if (journal === undefined) {
        return undefined
      }
      const journalPath = join(nomsDir, JOURNAL_FILE)
      await writeFile(journalPath, journal)
      return journalPath
    }

    it("manifest が同じでも、journal が伸びると印が変わる", async () => {
      await writeServerData(root(), "5:__DOLT__:root-1", "x".repeat(100))
      const before = await readBeadsStampOf(root())

      await writeServerData(root(), "5:__DOLT__:root-1", "x".repeat(180))

      expect(before).toEqual(expect.any(String))
      expect(await readBeadsStampOf(root())).not.toBe(before)
    })

    it("journal の大きさが同じなら、更新時刻だけ進んでも印は変わらない", async () => {
      const journal = await writeServerData(root(), "5:__DOLT__:root-1", "x".repeat(100))
      const before = await readBeadsStampOf(root())

      await utimes(journal ?? "", 1_000, 2_000)

      expect(before).toEqual(expect.any(String))
      expect(await readBeadsStampOf(root())).toBe(before)
    })

    it("journal がまだ無い起動直後も印が取れ、最初の書き込みで変わる", async () => {
      await writeServerData(root(), "5:__DOLT__:root-1", undefined)
      const before = await readBeadsStampOf(root())

      await writeServerData(root(), "5:__DOLT__:root-1", "x".repeat(40))

      expect(before).toEqual(expect.any(String))
      expect(await readBeadsStampOf(root())).not.toBe(before)
    })

    it("manifest の無い dolt があっても、embeddeddolt の印は取れる", async () => {
      await writeManifest(root(), "5:__DOLT__:root-1")
      await mkdir(join(root(), "dolt", "t"), { recursive: true })

      expect(await readBeadsStampOf(root())).toEqual(expect.any(String))
    })

    it("manifest の無い dolt だけなら undefined", async () => {
      await mkdir(join(root(), "dolt", "t"), { recursive: true })

      expect(await readBeadsStampOf(root())).toBeUndefined()
    })
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
