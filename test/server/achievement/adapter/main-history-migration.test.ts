import { join } from "node:path"

import { beforeEach, describe, expect, it } from "vitest"

import {
  createAchievementCommitCache,
  readAchievement,
} from "../../../../src/server/achievement/adapter/main-history.ts"
import { PROJECT_SETTINGS_PATH } from "../../../../src/shared/repository/project-settings.ts"
import { initBeadsWithIssues, useBeadsHome } from "../../../fixture/beads-repository.ts"
import {
  commitAt,
  commitNewFormatTask,
  known,
  newFormatTaskContent,
} from "../../../fixture/dated-commit.ts"
import { git, initGitRepository } from "../../../fixture/git-repository.ts"
import { writeProjectSettings } from "../../../fixture/project-settings.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

// git のタスクファイルから Beads へ移したリポジトリの、移行の境をまたぐ数え方。
// 本物の `bd` を、`HOME` を一時ディレクトリへ向けて起こす（`useBeadsHome`）。
// 閉じた時刻は今日にするので、Beads の側は今日、git の側は過去の日に置く。

const root = useTempDir("main-history-migration")
let repository: string

beforeEach(async () => {
  repository = join(root(), "repository")
  await initGitRepository(repository)
  writeProjectSettings(repository)
})

describe("readAchievement（Beads 方式）", () => {
  useBeadsHome(() => join(root(), "home"))
  const today = Temporal.Now.plainDateISO().toString()
  const SETTINGS = JSON.stringify({ tasks: { mainBranch: "main" } })

  /**
   * 移す前の git に、done のタスクと未完了のタスクのファイルを置き、過去の日に Beads へ移す
   * （`issues` を Beads に入れ、`develop/task/` を消してプロジェクトの設定をコミットする）。
   */
  async function migrateToBeads(
    issues: readonly Readonly<Record<string, unknown>>[],
  ): Promise<void> {
    await commitNewFormatTask(repository, "2026-09-10", "10:00", "T-001", "git で済んだ", "todo")
    await commitNewFormatTask(repository, "2026-09-10", "11:00", "T-002", "移した", "todo")
    await commitAt(
      repository,
      "2026-09-12",
      "10:00",
      "develop/task/T-001.md",
      newFormatTaskContent("T-001", "git で済んだ", "done"),
    )
    await initBeadsWithIssues(repository, issues)
    await git(repository, "rm", "--quiet", "-r", "develop/task")
    await commitAt(repository, "2026-09-20", "10:00", PROJECT_SETTINGS_PATH, SETTINGS)
  }

  it(
    "境の前は git の done、後は Beads の閉じた課題で数え、二重にも欠けにもならない",
    { timeout: 60_000 },
    async () => {
      const now = Temporal.Now.instant().toString()
      await migrateToBeads([
        { id: "t-002", title: "移した", status: "closed", created_at: now, closed_at: now },
        {
          id: "t-003",
          title: "Beads で作って済んだ",
          status: "closed",
          created_at: now,
          closed_at: now,
        },
        {
          id: "t-004",
          title: "やめた",
          status: "closed",
          created_at: now,
          closed_at: now,
          labels: ["cancelled"],
        },
        { id: "t-005", title: "まだ", status: "open", created_at: now },
      ])
      const cache = createAchievementCommitCache()

      const gitDay = known(await readAchievement(repository, "2026-09-12", today, cache))
      const migrationDay = known(await readAchievement(repository, "2026-09-20", today, cache))
      const beadsDay = known(await readAchievement(repository, today, today, cache))

      expect(gitDay.doneTasks).toEqual({
        kind: "known",
        items: [{ id: "T-001", summary: "git で済んだ" }],
      })
      expect(migrationDay.doneTasks).toEqual({ kind: "known", items: [] })
      expect(beadsDay.doneTasks).toEqual({
        kind: "known",
        items: [
          { id: "T-002", summary: "移した" },
          { id: "T-003", summary: "Beads で作って済んだ" },
        ],
      })
      // 移した課題の登録日は git のファイルの日（Beads の作った日は移した日なので使わない）。
      expect(beadsDay.graduations).toEqual([
        expect.objectContaining({ id: "T-002", registeredOn: "2026-09-10" }),
      ])
    },
  )
})
