import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  createAchievementCommitCache,
  readAchievement,
  readCommitCalendar,
  type ReadAchievementResult,
} from "../../../../src/server/achievement/adapter/main-history.ts"
import { type AchievementCalendar } from "../../../../src/shared/achievement-calendar.ts"
import { type DailyAchievement } from "../../../../src/shared/achievement.ts"
import { runSubprocessOrThrow } from "../../../fixture/subprocess.ts"

// 本物の `git` を起こす（`main` の上から実際に読むことそのものが検査の対象）。リポジトリは
// 一時ディレクトリに毎回作り、中身は架空のコミット・タスクだけにする
// （docs/coding-standards.md「会話内容の扱い」）。コミットの日付は `GIT_COMMITTER_DATE` で
// 固定し、実行した日に依らず同じ結果になるようにする。

let root: string
let repository: string

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "tsukumo-main-history-"))
  repository = join(root, "repository")
  mkdirSync(repository)
  await git(repository, "init", "-q", "-b", "main")
  await git(repository, "config", "user.name", "tsukumo-test")
  await git(repository, "config", "user.email", "tsukumo-test@example.invalid")
  await git(repository, "config", "commit.gpgsign", "false")
  await git(repository, "config", "core.hooksPath", "/dev/null")
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

async function git(cwd: string, ...args: readonly string[]): Promise<void> {
  await runSubprocessOrThrow("git", args, { cwd })
}

/** `date`（`YYYY-MM-DD`）の `hhmm` を、**`readAchievement` が読む `Temporal.Now.timeZoneId()` と
 * 同じゾーンのローカル時刻**として絶対時刻（オフセット付き ISO）に直す。**固定のオフセット
 * （`+09:00` 決め打ち）は使わない**——`bun test` はプロセスの `TZ` を `UTC` にする
 * （ホストが JST でも変わらない）ため、決め打つと `localDateEpochRange` が見る日の境界と
 * ずれ、境界に近い時刻のコミットが意図と違う日に数えられる。 */
function isoDateAt(date: string, hhmm: string): string {
  const zone = Temporal.Now.timeZoneId()
  return Temporal.PlainDateTime.from(`${date}T${hhmm}:00`)
    .toZonedDateTime(zone)
    .toString({ timeZoneName: "never" })
}

/** ローカル時刻の `date`（`YYYY-MM-DD`）の `hhmm` に、架空のファイルを1件コミットする。
 * committer date と author date を両方固定する（成果はコミットの日付=committer date で
 * 決まるので、これを固定しないとテストの実行日に結果が変わる）。 */
async function commitAt(
  cwd: string,
  date: string,
  hhmm: string,
  fileName: string,
  content = "架空の内容",
): Promise<void> {
  const path = join(cwd, fileName)
  mkdirSync(join(cwd, ...fileName.split("/").slice(0, -1)), { recursive: true })
  writeFileSync(path, content)
  await git(cwd, "add", fileName)
  const isoDate = isoDateAt(date, hhmm)
  await runSubprocessOrThrow("git", ["commit", "-q", "-m", `commit ${fileName}`], {
    cwd,
    env: { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate },
  })
}

/** 新形式（`develop/task/T-xxx.md`）の1件を front matter で書いてコミットする。 */
async function commitNewFormatTask(
  cwd: string,
  date: string,
  hhmm: string,
  id: string,
  summary: string,
  status: string,
): Promise<void> {
  const content = [
    "---",
    `id: ${id}`,
    `summary: ${summary}`,
    `status: ${status}`,
    "difficulty: sonnet",
    "loopable: Y",
    "dependencies: []",
    "---",
    "",
  ].join("\n")
  await commitAt(cwd, date, hhmm, `develop/task/${id}.md`, content)
}

/** 新形式（`develop/task/T-xxx.md`）の内容そのもの（front matter）。 */
function newFormatTaskContent(id: string, summary: string, status: string): string {
  return [
    "---",
    `id: ${id}`,
    `summary: ${summary}`,
    `status: ${status}`,
    "difficulty: sonnet",
    "loopable: Y",
    "dependencies: []",
    "---",
    "",
  ].join("\n")
}

/** 複数の新形式タスクファイルを**1回のコミット**で書く（節目（通算のタスクの数）のテストで
 * 大量のタスクを安く用意するための道具。1件ごとに `git commit` すると `git` の起動回数が
 * 増えてテストが重くなるため）。 */
async function commitManyNewFormatTasks(
  cwd: string,
  date: string,
  hhmm: string,
  tasks: readonly { readonly id: string; readonly summary: string; readonly status: string }[],
): Promise<void> {
  const dir = join(cwd, "develop", "task")
  mkdirSync(dir, { recursive: true })
  for (const task of tasks) {
    writeFileSync(
      join(dir, `${task.id}.md`),
      newFormatTaskContent(task.id, task.summary, task.status),
    )
  }
  await git(cwd, "add", "develop/task")
  const isoDate = isoDateAt(date, hhmm)
  await runSubprocessOrThrow("git", ["commit", "-q", "-m", "commit many task files"], {
    cwd,
    env: { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate },
  })
}

/** タスクファイルを1件消す（`task prune` が消すのと同じ操作。`docs/requirements.md` 4.11
 * 「`done` になった日」の「消えたファイル」の検査に使う）。 */
async function deleteTaskFile(cwd: string, date: string, hhmm: string, id: string): Promise<void> {
  await git(cwd, "rm", "--quiet", `develop/task/${id}.md`)
  const isoDate = isoDateAt(date, hhmm)
  await runSubprocessOrThrow("git", ["commit", "-q", "-m", `prune ${id}`], {
    cwd,
    env: { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate },
  })
}

/** 旧形式（`develop/tasks.json`）を書いてコミットする。 */
async function commitOldFormatTasks(
  cwd: string,
  date: string,
  hhmm: string,
  tasks: readonly Record<string, unknown>[],
): Promise<void> {
  await commitAt(cwd, date, hhmm, "develop/tasks.json", JSON.stringify(tasks))
}

/** 「読めた」かつ `doneTasks` が数えられている前提のテストで使う。前提が崩れたら例外を投げて
 * 落とす（`toMatchObject` / `toEqual` の食い違いより先に、なぜ崩れたかが分かる）。 */
function known(result: ReadAchievementResult): Extract<DailyAchievement, { kind: "known" }> {
  if (result.kind !== "ok" || result.achievement.kind !== "known") {
    throw new Error("known な achievement ではなかった")
  }
  return result.achievement
}

describe("readAchievement", () => {
  it("main ブランチが無いリポジトリでは「不明」", async () => {
    // init はしたが1つもコミットしていないので main が無い。
    const result = await readAchievement(
      repository,
      "2026-09-24",
      "2026-09-24",
      createAchievementCommitCache(),
    )

    expect(result).toEqual({ kind: "ok", achievement: { kind: "unknown" } })
  })

  it("git リポジトリでないディレクトリでは「不明」", async () => {
    const result = await readAchievement(
      root,
      "2026-09-24",
      "2026-09-24",
      createAchievementCommitCache(),
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
      await readAchievement(repository, "2026-09-23", "2026-09-24", createAchievementCommitCache()),
    )

    expect(achievement).toMatchObject({ kind: "known", date: "2026-09-23", commitCount: 3 })
  })

  it("運用の帳面だけを触ったコミットは数えない", async () => {
    await commitAt(repository, "2026-09-23", "10:00", "src/work.ts")
    await commitOldFormatTasks(repository, "2026-09-23", "11:00", [])
    await commitAt(repository, "2026-09-23", "12:00", "develop/progress.md")

    const achievement = known(
      await readAchievement(repository, "2026-09-23", "2026-09-24", createAchievementCommitCache()),
    )

    expect(achievement).toMatchObject({ commitCount: 1 })
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
      await readAchievement(repository, "2026-09-23", "2026-09-24", createAchievementCommitCache()),
    )

    // feature.txt と main.txt の2件（merge 自体は数えない）。
    expect(achievement).toMatchObject({ commitCount: 2 })
  })

  it("タスクの記録がどちらの形式も無いリポジトリでは、doneTasks が「数えられない」でコミットは数える", async () => {
    await commitAt(repository, "2026-09-23", "10:00", "README.md")

    const achievement = known(
      await readAchievement(repository, "2026-09-23", "2026-09-24", createAchievementCommitCache()),
    )

    expect(achievement).toEqual({
      kind: "known",
      date: "2026-09-23",
      today: "2026-09-24",
      commitCount: 1,
      doneTasks: { kind: "unknown" },
      graduations: [],
      milestones: [],
      diary: { kind: "none" },
    })
  })

  it("新形式: その日の終わりまでに done になったタスクを、前の日には無かった分だけ返す", async () => {
    await commitNewFormatTask(
      repository,
      "2026-09-22",
      "10:00",
      "T-001",
      "前の日に終わった",
      "done",
    )
    await commitNewFormatTask(repository, "2026-09-23", "09:00", "T-002", "今日終わった", "todo")
    await commitAt(
      repository,
      "2026-09-23",
      "18:00",
      "develop/task/T-002.md",
      [
        "---",
        "id: T-002",
        "summary: 今日終わった",
        "status: done",
        "difficulty: sonnet",
        "loopable: Y",
        "dependencies: []",
        "---",
        "",
      ].join("\n"),
    )
    await commitNewFormatTask(repository, "2026-09-23", "19:00", "T-003", "今日はまだ", "todo")

    const achievement = known(
      await readAchievement(repository, "2026-09-23", "2026-09-24", createAchievementCommitCache()),
    )

    expect(achievement.doneTasks).toEqual({
      kind: "known",
      items: [{ id: "T-002", summary: "今日終わった" }],
    })
  })

  it("旧形式: passes: true の done だけを数え、dropped（done + passes:false）は数えない", async () => {
    await commitOldFormatTasks(repository, "2026-09-23", "09:00", [
      { id: "T-001", summary: "todo", status: "todo" },
    ])
    await commitOldFormatTasks(repository, "2026-09-23", "18:00", [
      { id: "T-001", summary: "合格", status: "done", passes: true },
      { id: "T-002", summary: "却下", status: "done", passes: false },
    ])

    const achievement = known(
      await readAchievement(repository, "2026-09-23", "2026-09-24", createAchievementCommitCache()),
    )

    expect(achievement.doneTasks).toEqual({
      kind: "known",
      items: [{ id: "T-001", summary: "合格" }],
    })
  })

  it("アーカイブ（docs/history/tasks.md）の done も拾う", async () => {
    await commitOldFormatTasks(repository, "2026-09-22", "10:00", [
      { id: "T-001", summary: "todo", status: "todo" },
    ])
    const archive = [
      "# 完了タスクのアーカイブ",
      "",
      "## T-001 アーカイブされた完了",
      "",
      "- **difficulty**: `sonnet` / **passes**: `true` / **dependencies**: なし",
    ].join("\n")
    await commitAt(repository, "2026-09-23", "18:00", "docs/history/tasks.md", archive)
    // アーカイブしたので旧形式からは消える想定（tasks.json を空にする）。
    await commitOldFormatTasks(repository, "2026-09-23", "18:01", [])

    const achievement = known(
      await readAchievement(repository, "2026-09-23", "2026-09-24", createAchievementCommitCache()),
    )

    expect(achievement.doneTasks).toEqual({
      kind: "known",
      items: [{ id: "T-001", summary: "アーカイブされた完了" }],
    })
  })

  it("形式の切り替え（新形式への移行）の日は done の集合が変わらないので、その日は0件", async () => {
    await commitOldFormatTasks(repository, "2026-09-22", "10:00", [
      { id: "T-001", summary: "旧形式で完了", status: "done", passes: true },
    ])
    // 移行: 旧形式を消し、同じ ID を新形式で done のまま書く。
    await git(repository, "rm", "--quiet", "develop/tasks.json")
    await runSubprocessOrThrow("git", ["commit", "-q", "-m", "migrate"], {
      cwd: repository,
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: isoDateAt("2026-09-23", "10:00"),
        GIT_COMMITTER_DATE: isoDateAt("2026-09-23", "10:00"),
      },
    })
    await commitNewFormatTask(repository, "2026-09-23", "11:00", "T-001", "旧形式で完了", "done")

    const achievement = known(
      await readAchievement(repository, "2026-09-23", "2026-09-24", createAchievementCommitCache()),
    )

    expect(achievement.doneTasks).toEqual({ kind: "known", items: [] })
  })

  it("リポジトリの最初の日（前の日の切り口が無い）は、その日の done を全件返す", async () => {
    await commitNewFormatTask(repository, "2026-09-23", "10:00", "T-001", "最初の完了", "done")

    const achievement = known(
      await readAchievement(repository, "2026-09-23", "2026-09-24", createAchievementCommitCache()),
    )

    expect(achievement.doneTasks).toEqual({
      kind: "known",
      items: [{ id: "T-001", summary: "最初の完了" }],
    })
  })

  it("date が無ければ今日、指定した日はそのまま見た日として返す", async () => {
    await commitAt(repository, "2026-09-20", "10:00", "old.txt")

    const achievement = known(
      await readAchievement(repository, "2026-09-20", "2026-09-24", createAchievementCommitCache()),
    )

    expect(achievement).toMatchObject({ date: "2026-09-20", today: "2026-09-24" })
  })

  it("main が無い・git が無いリポジトリでも例外を投げない", async () => {
    await expect(
      readAchievement(root, "2026-09-24", "2026-09-24", createAchievementCommitCache()),
    ).resolves.toEqual({
      kind: "ok",
      achievement: { kind: "unknown" },
    })
  })

  describe("卒業と節目", () => {
    it("登録から7日以上経って終えたタスクは卒業に載る", async () => {
      await commitNewFormatTask(
        repository,
        "2026-09-01",
        "10:00",
        "T-050",
        "長く待った作業",
        "todo",
      )
      await commitAt(
        repository,
        "2026-09-23",
        "09:00",
        "develop/task/T-050.md",
        newFormatTaskContent("T-050", "長く待った作業", "done"),
      )

      const achievement = known(
        await readAchievement(
          repository,
          "2026-09-23",
          "2026-09-24",
          createAchievementCommitCache(),
        ),
      )

      expect(achievement.graduations).toEqual([
        { id: "T-050", summary: "長く待った作業", registeredOn: "2026-09-01", days: 22 },
      ])
    })

    it("登録から7日未満で終えたタスクは卒業に載らない", async () => {
      await commitNewFormatTask(
        repository,
        "2026-09-20",
        "10:00",
        "T-051",
        "すぐ終わった作業",
        "todo",
      )
      await commitAt(
        repository,
        "2026-09-23",
        "09:00",
        "develop/task/T-051.md",
        newFormatTaskContent("T-051", "すぐ終わった作業", "done"),
      )

      const achievement = known(
        await readAchievement(
          repository,
          "2026-09-23",
          "2026-09-24",
          createAchievementCommitCache(),
        ),
      )

      expect(achievement.graduations).toEqual([])
    })

    it("形式の切り替えコミットで入ったファイルは、7日以上経っていても卒業に載らない", async () => {
      await commitOldFormatTasks(repository, "2026-09-01", "10:00", [
        { id: "T-052", summary: "旧形式のまま長く待った", status: "todo" },
      ])
      await git(repository, "rm", "--quiet", "develop/tasks.json")
      mkdirSync(join(repository, "develop", "task"), { recursive: true })
      writeFileSync(
        join(repository, "develop", "task", "T-052.md"),
        newFormatTaskContent("T-052", "旧形式のまま長く待った", "todo"),
      )
      await git(repository, "add", "develop/task/T-052.md")
      await runSubprocessOrThrow("git", ["commit", "-q", "-m", "migrate"], {
        cwd: repository,
        env: {
          ...process.env,
          GIT_AUTHOR_DATE: isoDateAt("2026-09-10", "10:00"),
          GIT_COMMITTER_DATE: isoDateAt("2026-09-10", "10:00"),
        },
      })
      await commitAt(
        repository,
        "2026-09-23",
        "09:00",
        "develop/task/T-052.md",
        newFormatTaskContent("T-052", "旧形式のまま長く待った", "done"),
      )

      const achievement = known(
        await readAchievement(
          repository,
          "2026-09-23",
          "2026-09-24",
          createAchievementCommitCache(),
        ),
      )

      expect(achievement.graduations).toEqual([])
    })

    it("同じ日のうちに終えて消えた（剪定された）タスクは、終えたタスク・卒業のどちらからも漏れない", async () => {
      // 剪定は task prune が行う操作そのもの（develop/task/T-xxx.md を git rm する）を、
      // ここでは直接 git 操作で再現する（task prune コマンド自体は T-560 が持つ）。
      await commitNewFormatTask(
        repository,
        "2026-09-01",
        "10:00",
        "T-060",
        "長く待って剪定された",
        "todo",
      )
      await commitAt(
        repository,
        "2026-09-23",
        "09:00",
        "develop/task/T-060.md",
        newFormatTaskContent("T-060", "長く待って剪定された", "done"),
      )
      await deleteTaskFile(repository, "2026-09-23", "18:00", "T-060")
      // hasTaskTracking が true であり続けるよう、消えないタスクを1件残す。
      await commitNewFormatTask(
        repository,
        "2026-09-23",
        "19:00",
        "T-999",
        "残っているタスク",
        "todo",
      )

      const achievement = known(
        await readAchievement(
          repository,
          "2026-09-23",
          "2026-09-24",
          createAchievementCommitCache(),
        ),
      )

      expect(achievement.doneTasks).toEqual({
        kind: "known",
        items: [{ id: "T-060", summary: "長く待って剪定された" }],
      })
      expect(achievement.graduations).toEqual([
        { id: "T-060", summary: "長く待って剪定された", registeredOn: "2026-09-01", days: 22 },
      ])
    })

    it("前の日までに消えた（剪定された）done のタスクは、通算の数に混ざって前の日の終わりの切り口に含まれる", async () => {
      // T-070 は前の日のうちに done → 剪定されている。今日、新たに1件 done にしたとき、
      // 「前の日には無かった」差分に T-070 が誤って再登場しないことを確かめる
      // （消えたファイルは前の日の切り口にも同じ規則で混ぜる）。
      await commitNewFormatTask(
        repository,
        "2026-09-01",
        "10:00",
        "T-070",
        "前の日に終わって剪定された",
        "todo",
      )
      await commitAt(
        repository,
        "2026-09-22",
        "09:00",
        "develop/task/T-070.md",
        newFormatTaskContent("T-070", "前の日に終わって剪定された", "done"),
      )
      await deleteTaskFile(repository, "2026-09-22", "18:00", "T-070")
      await commitNewFormatTask(repository, "2026-09-23", "10:00", "T-071", "今日終わった", "done")

      const achievement = known(
        await readAchievement(
          repository,
          "2026-09-23",
          "2026-09-24",
          createAchievementCommitCache(),
        ),
      )

      expect(achievement.doneTasks).toEqual({
        kind: "known",
        items: [{ id: "T-071", summary: "今日終わった" }],
      })
    })

    it("タスクの節目: 通算250件目（仮の刻み）に届いたタスクを返す", async () => {
      const before = Array.from({ length: 248 }, (_, index) => ({
        id: `T-${String(index + 1).padStart(3, "0")}`,
        summary: `済み${String(index + 1)}`,
        status: "done",
      }))
      await commitManyNewFormatTasks(repository, "2026-09-22", "10:00", before)
      await commitManyNewFormatTasks(repository, "2026-09-23", "10:00", [
        { id: "T-249", summary: "今日1件目", status: "done" },
        { id: "T-250", summary: "今日2件目（250件目）", status: "done" },
      ])

      const achievement = known(
        await readAchievement(
          repository,
          "2026-09-23",
          "2026-09-24",
          createAchievementCommitCache(),
        ),
      )

      expect(achievement.milestones).toContainEqual({ kind: "task", count: 250, taskId: "T-250" })
    })

    it("タスクの記録が無いリポジトリでは、卒業もタスクの節目も出ない", async () => {
      await commitAt(repository, "2026-09-23", "10:00", "README.md")

      const achievement = known(
        await readAchievement(
          repository,
          "2026-09-23",
          "2026-09-24",
          createAchievementCommitCache(),
        ),
      )

      expect(achievement.graduations).toEqual([])
      expect(achievement.milestones).toEqual([])
    })
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

describe("readCommitCalendar", () => {
  // TODAY は木曜。今週の月曜からその4週前の月曜までが範囲になる
  // （`achievementCalendarDateKeys` のテストと同じ計算）。
  const TODAY = "2026-09-24"

  it("main ブランチが無いリポジトリでは「不明」", async () => {
    const result = await readCommitCalendar(repository, TODAY, createAchievementCommitCache())

    expect(result).toEqual({ kind: "ok", calendar: { kind: "unknown" } })
  })

  it("git リポジトリでないディレクトリでは「不明」", async () => {
    const result = await readCommitCalendar(root, TODAY, createAchievementCommitCache())

    expect(result).toEqual({ kind: "ok", calendar: { kind: "unknown" } })
  })

  it("範囲（今日を含む週の月曜から4週前の月曜〜今日）の日ごとのコミット数を返す", async () => {
    await commitAt(repository, "2026-08-23", "23:00", "before-range.txt") // 範囲の1日前（除く）
    await commitAt(repository, "2026-08-24", "10:00", "range-start.txt") // 範囲の始まり（含む）
    await commitAt(repository, "2026-09-10", "09:00", "middle-a.txt")
    await commitAt(repository, "2026-09-10", "10:00", "middle-b.txt") // 同じ日に2件
    await commitAt(repository, "2026-09-24", "09:00", "today.txt") // 今日
    await commitOldFormatTasks(repository, "2026-09-10", "11:00", []) // 運用の帳面（数えない）

    const calendar = knownCalendar(
      await readCommitCalendar(repository, TODAY, createAchievementCommitCache()),
    )

    expect(calendar.today).toBe(TODAY)
    expect(calendar.days[0]).toEqual({ date: "2026-08-24", commitCount: 1 })
    expect(calendar.days.at(-1)).toEqual({ date: "2026-09-24", commitCount: 1 })
    expect(calendar.days.find((day) => day.date === "2026-09-10")).toEqual({
      date: "2026-09-10",
      commitCount: 2,
    })
    expect(calendar.days.map((day) => day.date)).not.toContain("2026-08-23")
    expect(calendar.diaryDates).toEqual([])
  })

  it("コミットの無い日は0件", async () => {
    await commitAt(repository, "2026-09-24", "09:00", "today.txt")

    const calendar = knownCalendar(
      await readCommitCalendar(repository, TODAY, createAchievementCommitCache()),
    )

    expect(calendar.days.find((day) => day.date === "2026-09-01")).toEqual({
      date: "2026-09-01",
      commitCount: 0,
    })
  })

  it("今日以外の日の数は覚え、2回目は取り直さない（今日の分だけ取り直す）", async () => {
    await commitAt(repository, "2026-09-01", "10:00", "past.txt")
    await commitAt(repository, "2026-09-24", "09:00", "today-1.txt")
    const cache = createAchievementCommitCache()

    const first = knownCalendar(await readCommitCalendar(repository, TODAY, cache))
    expect(first.days.find((day) => day.date === "2026-09-01")).toEqual({
      date: "2026-09-01",
      commitCount: 1,
    })
    expect(first.days.find((day) => day.date === TODAY)).toEqual({
      date: TODAY,
      commitCount: 1,
    })

    // 1回目で覚えた過去の日（09-01）の数を、実際の `git` の中身とは違う値に手で書き換える。
    // **2回目がこの書き換えた値をそのまま返せば、`git` を再度起こしていない証拠**（過去の日を
    // 実際に取り直したなら本物の数（1）に戻ってしまう）。今日はいつも取り直すので新しいコミットを
    // 増やし、その分が反映されることも確かめる。
    cache.rememberDailyCount("2026-09-01", 999)
    await commitAt(repository, "2026-09-24", "10:00", "today-2.txt")

    const second = knownCalendar(await readCommitCalendar(repository, TODAY, cache))
    expect(second.days.find((day) => day.date === "2026-09-01")).toEqual({
      date: "2026-09-01",
      commitCount: 999,
    })
    expect(second.days.find((day) => day.date === TODAY)).toEqual({
      date: TODAY,
      commitCount: 2,
    })
  })

  it("節目（readAchievement の通算のコミットの数）も、同じ入れ物で今日以外の日を覚える", async () => {
    await commitAt(repository, "2026-09-01", "10:00", "past.txt")
    await commitAt(repository, "2026-09-23", "10:00", "yesterday.txt")
    const cache = createAchievementCommitCache()

    await readAchievement(repository, "2026-09-23", TODAY, cache)
    expect(cache.totalBeforeDayOf("2026-09-23")).toBe(1)

    // 覚えた「その日の始まりまでの通算」を、実際の `git` の中身とは違う値に手で書き換える。
    // **2回目がこの書き換えた値をそのまま使えば、`git` を再度起こしていない証拠**。
    cache.rememberTotalBeforeDay("2026-09-23", 999)
    await readAchievement(repository, "2026-09-23", TODAY, cache)

    // 書き換えた値がそのまま使われ続けている（取り直していれば本物の数 1 に戻る）。
    expect(cache.totalBeforeDayOf("2026-09-23")).toBe(999)
  })
})
