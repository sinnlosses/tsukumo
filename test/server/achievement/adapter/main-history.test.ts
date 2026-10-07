import { mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"

import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createAchievementCache,
  readAchievement,
  readCommitCalendar,
} from "../../../../src/server/achievement/adapter/main-history.ts"
import type * as GitAdapter from "../../../../src/server/repository/adapter/git.ts"
import type { AchievementCalendar } from "../../../../src/shared/achievement/achievement-calendar.ts"
import { PROJECT_SETTINGS_PATH } from "../../../../src/shared/repository/project-settings.ts"
import {
  initBeadsWithIssues,
  initBeadsWithIssuesOutsideGit,
  useBeadsHome,
} from "../../../fixture/beads-repository.ts"
import { commitAt, isoDateAt, known } from "../../../fixture/dated-commit.ts"
import { git, initGitRepository } from "../../../fixture/git-repository.ts"
import {
  writeProjectSettings,
  writeProjectSettingsContent,
} from "../../../fixture/project-settings.ts"
import { runSubprocessOrThrow } from "../../../fixture/subprocess.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

// 本物の `git` を起こす（`main` の上から実際に読むことそのものが検査の対象）。リポジトリは
// 一時ディレクトリに毎回作る。コミットの日付は `GIT_COMMITTER_DATE` で
// 固定し、実行した日に依らず同じ結果になるようにする。
// 終えたタスクは本物の `bd` を、`HOME` を一時ディレクトリへ向けて起こす（`useBeadsHome`）。課題は架空のものだけ。

// 本物の `bd` と `git` は負荷で5秒を超えうるので、製品の上限だけ延ばす。
vi.mock("../../../../src/server/repository/adapter/git.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof GitAdapter>()),
  GIT_TIMEOUT_MS: 60_000,
}))

const root = useTempDir("main-history")
let repository: string

beforeEach(async () => {
  repository = join(root(), "repository")
  await initGitRepository(repository)
  writeProjectSettings(repository)
})

describe("readAchievement", { timeout: 60_000 }, () => {
  it("main ブランチが無いリポジトリでは「不明」", async () => {
    // init はしたが1つもコミットしていないので main が無い。
    const result = await readAchievement(
      repository,
      "2026-09-24",
      "2026-09-24",
      createAchievementCache(repository),
    )

    expect(result).toEqual({ kind: "ok", achievement: { kind: "unknown" } })
  })

  it("設定の主ブランチが master なら、master の履歴から数える", async () => {
    const masterRepository = join(root(), "master-repository")
    await initGitRepository(masterRepository, "master")
    writeProjectSettings(masterRepository, "master")
    await commitAt(masterRepository, "2026-09-23", "12:00", "a.txt")

    const achievement = known(
      await readAchievement(
        masterRepository,
        "2026-09-23",
        "2026-09-24",
        createAchievementCache(masterRepository),
      ),
    )

    expect(achievement).toMatchObject({ kind: "known", commits: { kind: "known", count: 1 } })
  })

  it("git リポジトリでないディレクトリでは「不明」", async () => {
    const result = await readAchievement(
      root(),
      "2026-09-24",
      "2026-09-24",
      createAchievementCache(root()),
    )

    expect(result).toEqual({ kind: "ok", achievement: { kind: "unknown" } })
  })

  it("その日の [0時, 24時) の範囲のコミットだけを数える（範囲外は数えない）", async () => {
    await commitAt(repository, "2026-09-22", "23:59", "before.txt") // 前日の終わり際
    await commitAt(repository, "2026-09-23", "00:00", "start.txt") // その日の始まり（含む）
    await commitAt(repository, "2026-09-23", "12:00", "noon.txt")
    await commitAt(repository, "2026-09-23", "23:59", "end.txt")
    await commitAt(repository, "2026-09-24", "00:00", "after.txt") // 次の日の始まり（含まない）

    const achievement = known(
      await readAchievement(
        repository,
        "2026-09-23",
        "2026-09-24",
        createAchievementCache(repository),
      ),
    )

    expect(achievement).toMatchObject({
      kind: "known",
      date: "2026-09-23",
      commits: { kind: "known", count: 3 },
    })
  })

  it("触ったファイルに依らずコミットを数える", async () => {
    await commitAt(repository, "2026-09-23", "10:00", "src/work.ts")
    await commitAt(repository, "2026-09-23", "11:00", "develop/tasks.json")
    await commitAt(repository, "2026-09-23", "12:00", "develop/progress.md")

    const achievement = known(
      await readAchievement(
        repository,
        "2026-09-23",
        "2026-09-24",
        createAchievementCache(repository),
      ),
    )

    expect(achievement).toMatchObject({ commits: { kind: "known", count: 3 } })
  })

  it("merge commit は数えない", async () => {
    // 空のリポジトリでは `main` がまだ ref として存在しない（unborn）ので、分岐する前に
    // 1件コミットして `main` を実在させる。
    await commitAt(repository, "2026-09-22", "09:00", "base.txt")
    await git(repository, "checkout", "-q", "-b", "feature")
    await commitAt(repository, "2026-09-23", "09:00", "feature.txt")
    await git(repository, "checkout", "-q", "main")
    await commitAt(repository, "2026-09-23", "10:00", "main.txt")
    await runSubprocessOrThrow("git", ["merge", "--no-ff", "-q", "-m", "merge", "feature"], {
      cwd: repository,
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: isoDateAt("2026-09-23", "11:00"),
        GIT_COMMITTER_DATE: isoDateAt("2026-09-23", "11:00"),
      },
    })

    const achievement = known(
      await readAchievement(
        repository,
        "2026-09-23",
        "2026-09-24",
        createAchievementCache(repository),
      ),
    )

    // feature.txt と main.txt の2件（merge 自体は数えない）。
    expect(achievement).toMatchObject({ commits: { kind: "known", count: 2 } })
  })

  it(".beads が無いリポジトリでは、doneTasks が「数えられない」でコミットは数える", async () => {
    await commitAt(repository, "2026-09-23", "10:00", "README.md")

    const achievement = known(
      await readAchievement(
        repository,
        "2026-09-23",
        "2026-09-24",
        createAchievementCache(repository),
      ),
    )

    expect(achievement).toEqual({
      kind: "known",
      date: "2026-09-23",
      today: "2026-09-24",
      commits: { kind: "known", count: 1 },
      doneTasks: { kind: "unknown" },
      graduations: [],
      milestones: [],
      diary: { kind: "none" },
    })
  })

  it("プロジェクトの設定が無いリポジトリでは、いまのブランチでコミットを数える", async () => {
    rmSync(join(repository, PROJECT_SETTINGS_PATH))
    await commitAt(repository, "2026-09-23", "10:00", "main.txt")
    await git(repository, "checkout", "-q", "-b", "feature")
    await commitAt(repository, "2026-09-23", "11:00", "feature.txt")

    const achievement = known(
      await readAchievement(
        repository,
        "2026-09-23",
        "2026-09-24",
        createAchievementCache(repository),
      ),
    )

    expect(achievement).toMatchObject({
      commits: { kind: "known", count: 2 },
      doneTasks: { kind: "unknown" },
    })
  })

  it("タスク運用を使わない設定のリポジトリでは、いまのブランチでコミットを数え、タスクは数えない", async () => {
    writeProjectSettingsContent(repository, '{ "tasks": "off" }')
    await commitAt(repository, "2026-09-23", "10:00", "main.txt")
    await git(repository, "checkout", "-q", "-b", "feature")
    await commitAt(repository, "2026-09-23", "11:00", "feature.txt")

    const achievement = known(
      await readAchievement(
        repository,
        "2026-09-23",
        "2026-09-24",
        createAchievementCache(repository),
      ),
    )

    expect(achievement).toMatchObject({
      commits: { kind: "known", count: 2 },
      doneTasks: { kind: "unknown" },
    })
  })

  it("プロジェクトの設定が壊れているリポジトリでは「不明」", async () => {
    writeProjectSettingsContent(repository, "{")
    await commitAt(repository, "2026-09-23", "10:00", "README.md")

    const result = await readAchievement(
      repository,
      "2026-09-23",
      "2026-09-24",
      createAchievementCache(repository),
    )

    expect(result).toEqual({ kind: "ok", achievement: { kind: "unknown" } })
  })

  it("設定が無く HEAD が枝を指さないときは「不明」", async () => {
    rmSync(join(repository, PROJECT_SETTINGS_PATH))
    await commitAt(repository, "2026-09-23", "10:00", "README.md")
    await git(repository, "checkout", "-q", "--detach")

    const result = await readAchievement(
      repository,
      "2026-09-23",
      "2026-09-24",
      createAchievementCache(repository),
    )

    expect(result).toEqual({ kind: "ok", achievement: { kind: "unknown" } })
  })
})

describe("readAchievement（Beads の閉じた課題）", () => {
  useBeadsHome(() => join(root(), "home"))

  /** `bd export` の1行の形の課題。時刻はローカル時刻の `date` の `hhmm`。 */
  function issue(
    id: string,
    title: string,
    created: readonly [string, string],
    closed: readonly [string, string] | "open",
    labels: readonly string[] = [],
  ): Readonly<Record<string, unknown>> {
    return {
      id,
      title,
      status: closed === "open" ? "open" : "closed",
      created_at: isoDateAt(...created),
      ...(closed === "open" ? {} : { closed_at: isoDateAt(...closed) }),
      labels,
    }
  }

  it(
    "その日のうちに閉じた課題をラベルに依らず終えたタスクにし、前の日に閉じた・開いた課題は数えない",
    { timeout: 60_000 },
    async () => {
      await commitAt(repository, "2026-09-23", "10:00", "README.md")
      await initBeadsWithIssues(repository, [
        issue("t-001", "前の日に済んだ", ["2026-09-20", "10:00"], ["2026-09-22", "18:00"]),
        issue("t-002", "今日済んだ", ["2026-09-21", "10:00"], ["2026-09-23", "18:00"]),
        issue("t-003", "やめた", ["2026-09-21", "10:00"], ["2026-09-23", "18:00"], ["cancelled"]),
        issue("t-004", "まだ", ["2026-09-21", "10:00"], "open"),
      ])

      const achievement = known(
        await readAchievement(
          repository,
          "2026-09-23",
          "2026-09-24",
          createAchievementCache(repository),
        ),
      )

      expect(achievement).toMatchObject({
        commits: { kind: "known", count: 1 },
        doneTasks: {
          kind: "known",
          items: [
            { id: "t-002", summary: "今日済んだ" },
            { id: "t-003", summary: "やめた" },
          ],
        },
      })
    },
  )

  it("タスクの節目: 通算250件目（仮の刻み）に届いたタスクを返す", { timeout: 60_000 }, async () => {
    await commitAt(repository, "2026-09-23", "10:00", "README.md")
    const before = Array.from({ length: 248 }, (_, index) =>
      issue(
        `t-${String(index + 1).padStart(3, "0")}`,
        `済み${String(index + 1)}`,
        ["2026-09-01", "10:00"],
        ["2026-09-22", "10:00"],
      ),
    )
    await initBeadsWithIssues(repository, [
      ...before,
      issue("t-249", "今日1件目", ["2026-09-01", "10:00"], ["2026-09-23", "10:00"]),
      issue("t-250", "今日2件目（250件目）", ["2026-09-01", "10:00"], ["2026-09-23", "11:00"]),
    ])

    const achievement = known(
      await readAchievement(
        repository,
        "2026-09-23",
        "2026-09-24",
        createAchievementCache(repository),
      ),
    )

    expect(achievement.milestones).toContainEqual({ kind: "task", count: 250, taskId: "t-250" })
  })

  it(
    "プロジェクトの設定が無くても .beads があれば終えたタスクを数える",
    { timeout: 60_000 },
    async () => {
      rmSync(join(repository, PROJECT_SETTINGS_PATH))
      await commitAt(repository, "2026-09-23", "10:00", "README.md")
      await initBeadsWithIssues(repository, [
        issue("t-001", "今日済んだ", ["2026-09-21", "10:00"], ["2026-09-23", "18:00"]),
      ])

      const achievement = known(
        await readAchievement(
          repository,
          "2026-09-23",
          "2026-09-24",
          createAchievementCache(repository),
        ),
      )

      expect(achievement.doneTasks).toEqual({
        kind: "known",
        items: [{ id: "t-001", summary: "今日済んだ" }],
      })
    },
  )

  it("タスク運用を使わない設定なら、.beads があっても読まない", { timeout: 60_000 }, async () => {
    writeProjectSettingsContent(repository, '{ "tasks": "off" }')
    await commitAt(repository, "2026-09-23", "10:00", "README.md")
    await initBeadsWithIssues(repository, [
      issue("t-001", "今日済んだ", ["2026-09-21", "10:00"], ["2026-09-23", "18:00"]),
    ])

    const achievement = known(
      await readAchievement(
        repository,
        "2026-09-23",
        "2026-09-24",
        createAchievementCache(repository),
      ),
    )

    expect(achievement.doneTasks).toEqual({ kind: "unknown" })
  })

  describe("数える枝が読めないとき", () => {
    const TODAY = "2026-09-24"

    async function outsideGitWithBeads(): Promise<string> {
      const dir = join(root(), "outside-git")
      mkdirSync(dir, { recursive: true })
      await initBeadsWithIssuesOutsideGit(dir, [
        issue("t-001", "前の日に済んだ", ["2026-09-01", "10:00"], ["2026-09-22", "18:00"]),
        issue("t-002", "今日済んだ", ["2026-09-01", "10:00"], ["2026-09-23", "18:00"]),
        issue("t-003", "今日済んだ2", ["2026-09-20", "10:00"], ["2026-09-23", "19:00"]),
        issue("t-004", "やめた", ["2026-09-20", "10:00"], ["2026-09-23", "19:00"], ["cancelled"]),
      ])
      return dir
    }

    it(
      "git リポジトリでなくても .beads があれば、コミットの数を unknown にして終えたタスクを数える",
      { timeout: 60_000 },
      async () => {
        const dir = await outsideGitWithBeads()

        const achievement = known(
          await readAchievement(dir, "2026-09-23", TODAY, createAchievementCache(dir)),
        )

        expect(achievement).toMatchObject({
          commits: { kind: "unknown" },
          doneTasks: {
            kind: "known",
            items: [
              { id: "t-002", summary: "今日済んだ" },
              { id: "t-003", summary: "今日済んだ2" },
              { id: "t-004", summary: "やめた" },
            ],
          },
          graduations: [{ id: "t-002", registeredOn: "2026-09-01", days: 22 }],
          milestones: [],
        })
      },
    )

    it(
      "git リポジトリでなくても .beads があれば、暦を閉じた日の課題の数で描く",
      { timeout: 60_000 },
      async () => {
        const dir = await outsideGitWithBeads()

        const calendar = knownCalendar(
          await readCommitCalendar(dir, TODAY, createAchievementCache(dir)),
        )

        expect(calendar.counted).toBe("done-tasks")
        expect(calendar.days.find((day) => day.date === "2026-09-22")).toEqual({
          date: "2026-09-22",
          count: 1,
        })
        expect(calendar.days.find((day) => day.date === "2026-09-23")).toEqual({
          date: "2026-09-23",
          count: 3,
        })
        expect(calendar.days.find((day) => day.date === TODAY)).toEqual({ date: TODAY, count: 0 })
      },
    )

    it(
      "主ブランチにまだコミットが無くても .beads があれば終えたタスクを数える",
      { timeout: 60_000 },
      async () => {
        await initBeadsWithIssues(repository, [
          issue("t-001", "今日済んだ", ["2026-09-21", "10:00"], ["2026-09-23", "18:00"]),
        ])

        const achievement = known(
          await readAchievement(
            repository,
            "2026-09-23",
            TODAY,
            createAchievementCache(repository),
          ),
        )

        expect(achievement).toMatchObject({
          commits: { kind: "unknown" },
          doneTasks: { kind: "known", items: [{ id: "t-001", summary: "今日済んだ" }] },
        })
      },
    )

    it("タスク運用を使わない設定なら、.beads があっても「不明」", { timeout: 60_000 }, async () => {
      const dir = await outsideGitWithBeads()
      writeProjectSettingsContent(dir, '{ "tasks": "off" }')
      const cache = createAchievementCache(dir)

      expect(await readAchievement(dir, "2026-09-23", TODAY, cache)).toEqual({
        kind: "ok",
        achievement: { kind: "unknown" },
      })
      expect(await readCommitCalendar(dir, TODAY, cache)).toEqual({
        kind: "ok",
        calendar: { kind: "unknown" },
      })
    })
  })

  it(".beads があるのに bd が課題を読めなければ「取れなかった」", { timeout: 60_000 }, async () => {
    await commitAt(repository, "2026-09-23", "10:00", "README.md")
    await initBeadsWithIssues(repository, [
      issue("t-001", "今日済んだ", ["2026-09-21", "10:00"], ["2026-09-23", "18:00"]),
    ])
    rmSync(join(repository, ".beads", "embeddeddolt"), { recursive: true, force: true })

    const result = await readAchievement(
      repository,
      "2026-09-23",
      "2026-09-24",
      createAchievementCache(repository),
    )

    expect(result).toEqual({ kind: "unavailable" })
  })
})

/** 「読めた」前提のテストで使う。前提が崩れたら例外を投げて落とす（`known` と同じ理由）。 */
function knownCalendar(
  result: Awaited<ReturnType<typeof readCommitCalendar>>,
): Extract<AchievementCalendar, { kind: "known" }> {
  if (result.kind !== "ok" || result.calendar.kind !== "known") {
    throw new Error("known な calendar ではなかった")
  }
  return result.calendar
}

describe("readCommitCalendar", { timeout: 60_000 }, () => {
  // TODAY は木曜。今週の月曜からその4週前の月曜までが範囲になる
  // （`achievementCalendarDateKeys` のテストと同じ計算）。
  const TODAY = "2026-09-24"

  it("main ブランチが無いリポジトリでは「不明」", async () => {
    const result = await readCommitCalendar(repository, TODAY, createAchievementCache(repository))

    expect(result).toEqual({ kind: "ok", calendar: { kind: "unknown" } })
  })

  it("設定が無ければ、いまのブランチの日ごとのコミット数を返す", async () => {
    rmSync(join(repository, PROJECT_SETTINGS_PATH))
    await commitAt(repository, "2026-09-23", "10:00", "a.txt")

    const result = await readCommitCalendar(repository, TODAY, createAchievementCache(repository))

    expect(result).toMatchObject({ kind: "ok", calendar: { kind: "known" } })
  })

  it("git リポジトリでないディレクトリでは「不明」", async () => {
    const result = await readCommitCalendar(root(), TODAY, createAchievementCache(root()))

    expect(result).toEqual({ kind: "ok", calendar: { kind: "unknown" } })
  })

  it("範囲（今日を含む週の月曜から4週前の月曜〜今日）の日ごとのコミット数を返す", async () => {
    await commitAt(repository, "2026-08-23", "23:00", "before-range.txt") // 範囲の1日前（除く）
    await commitAt(repository, "2026-08-24", "10:00", "range-start.txt") // 範囲の始まり（含む）
    await commitAt(repository, "2026-09-10", "09:00", "middle-a.txt")
    await commitAt(repository, "2026-09-10", "10:00", "middle-b.txt") // 同じ日に2件
    await commitAt(repository, "2026-09-24", "09:00", "today.txt") // 今日

    const calendar = knownCalendar(
      await readCommitCalendar(repository, TODAY, createAchievementCache(repository)),
    )

    expect(calendar.today).toBe(TODAY)
    expect(calendar.counted).toBe("commits")
    expect(calendar.days[0]).toEqual({ date: "2026-08-24", count: 1 })
    expect(calendar.days.at(-1)).toEqual({ date: "2026-09-24", count: 1 })
    expect(calendar.days.find((day) => day.date === "2026-09-10")).toEqual({
      date: "2026-09-10",
      count: 2,
    })
    expect(calendar.days.map((day) => day.date)).not.toContain("2026-08-23")
    expect(calendar.diaryDates).toEqual([])
  })

  it("コミットの無い日は0件", async () => {
    await commitAt(repository, "2026-09-24", "09:00", "today.txt")

    const calendar = knownCalendar(
      await readCommitCalendar(repository, TODAY, createAchievementCache(repository)),
    )

    expect(calendar.days.find((day) => day.date === "2026-09-01")).toEqual({
      date: "2026-09-01",
      count: 0,
    })
  })

  it("今日以外の日の数は覚え、2回目は取り直さない（今日の分だけ取り直す）", async () => {
    await commitAt(repository, "2026-09-01", "10:00", "past.txt")
    await commitAt(repository, "2026-09-24", "09:00", "today-1.txt")
    const cache = createAchievementCache(repository)

    const first = knownCalendar(await readCommitCalendar(repository, TODAY, cache))
    expect(first.days.find((day) => day.date === "2026-09-01")).toEqual({
      date: "2026-09-01",
      count: 1,
    })
    expect(first.days.find((day) => day.date === TODAY)).toEqual({
      date: TODAY,
      count: 1,
    })

    // 1回目で覚えた過去の日（09-01）の数を、実際の `git` の中身とは違う値に手で書き換える。
    // 2回目がこの書き換えた値をそのまま返せば、`git` を再度起こしていない証拠（過去の日を
    // 実際に取り直したなら本物の数（1）に戻ってしまう）。今日はいつも取り直すので新しいコミットを
    // 増やし、その分が反映されることも確かめる。
    cache.rememberDailyCount("2026-09-01", 999)
    await commitAt(repository, "2026-09-24", "10:00", "today-2.txt")

    const second = knownCalendar(await readCommitCalendar(repository, TODAY, cache))
    expect(second.days.find((day) => day.date === "2026-09-01")).toEqual({
      date: "2026-09-01",
      count: 999,
    })
    expect(second.days.find((day) => day.date === TODAY)).toEqual({
      date: TODAY,
      count: 2,
    })
  })

  it("節目（readAchievement の通算のコミットの数）も、同じ入れ物で今日以外の日を覚える", async () => {
    await commitAt(repository, "2026-09-01", "10:00", "past.txt")
    await commitAt(repository, "2026-09-23", "10:00", "yesterday.txt")
    const cache = createAchievementCache(repository)

    await readAchievement(repository, "2026-09-23", TODAY, cache)
    expect(cache.totalBeforeDayOf("2026-09-23")).toBe(1)

    // 覚えた「その日の始まりまでの通算」を、実際の `git` の中身とは違う値に手で書き換える。
    // 2回目がこの書き換えた値をそのまま使えば、`git` を再度起こしていない証拠。
    cache.rememberTotalBeforeDay("2026-09-23", 999)
    await readAchievement(repository, "2026-09-23", TODAY, cache)

    // 書き換えた値がそのまま使われ続けている（取り直していれば本物の数 1 に戻る）。
    expect(cache.totalBeforeDayOf("2026-09-23")).toBe(999)
  })
})
