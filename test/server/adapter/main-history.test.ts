import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  readAchievement,
  type ReadAchievementResult,
} from "../../../src/server/adapter/main-history.ts"
import { type DailyAchievement } from "../../../src/shared/achievement.ts"

// 本物の `git` を起こす（`main` の上から実際に読むことそのものが検査の対象）。リポジトリは
// 一時ディレクトリに毎回作り、中身は架空のコミット・タスクだけにする
// （docs/coding-standards.md「会話内容の扱い」）。コミットの日付は `GIT_COMMITTER_DATE` で
// 固定し、実行した日に依らず同じ結果になるようにする。

let root: string
let repository: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tsukumo-main-history-"))
  repository = join(root, "repository")
  mkdirSync(repository)
  git(repository, "init", "-q", "-b", "main")
  git(repository, "config", "user.name", "tsukumo-test")
  git(repository, "config", "user.email", "tsukumo-test@example.invalid")
  git(repository, "config", "commit.gpgsign", "false")
  git(repository, "config", "core.hooksPath", "/dev/null")
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function git(cwd: string, ...args: readonly string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" })
}

/** ローカル時刻の `date`（`YYYY-MM-DD`）の `hhmm` に、架空のファイルを1件コミットする。
 * committer date と author date を両方固定する（成果はコミットの日付=committer date で
 * 決まるので、これを固定しないとテストの実行日に結果が変わる）。 */
function commitAt(
  cwd: string,
  date: string,
  hhmm: string,
  fileName: string,
  content = "架空の内容",
): void {
  const path = join(cwd, fileName)
  mkdirSync(join(cwd, ...fileName.split("/").slice(0, -1)), { recursive: true })
  writeFileSync(path, content)
  git(cwd, "add", fileName)
  const isoDate = `${date}T${hhmm}:00+09:00`
  execFileSync("git", ["commit", "-q", "-m", `commit ${fileName}`], {
    cwd,
    stdio: "ignore",
    env: { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate },
  })
}

/** 新形式（`develop/task/T-xxx.md`）の1件を front matter で書いてコミットする。 */
function commitNewFormatTask(
  cwd: string,
  date: string,
  hhmm: string,
  id: string,
  summary: string,
  status: string,
): void {
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
  commitAt(cwd, date, hhmm, `develop/task/${id}.md`, content)
}

/** 旧形式（`develop/tasks.json`）を書いてコミットする。 */
function commitOldFormatTasks(
  cwd: string,
  date: string,
  hhmm: string,
  tasks: readonly Record<string, unknown>[],
): void {
  commitAt(cwd, date, hhmm, "develop/tasks.json", JSON.stringify(tasks))
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
    const result = await readAchievement(repository, "2026-09-24", "2026-09-24")

    expect(result).toEqual({ kind: "ok", achievement: { kind: "unknown" } })
  })

  it("git リポジトリでないディレクトリでは「不明」", async () => {
    const result = await readAchievement(root, "2026-09-24", "2026-09-24")

    expect(result).toEqual({ kind: "ok", achievement: { kind: "unknown" } })
  })

  it("その日の [0時, 24時) の範囲のコミットだけを数える（範囲外は数えない）", async () => {
    commitAt(repository, "2026-09-22", "23:59", "before.txt") // 前日の終わり際
    commitAt(repository, "2026-09-23", "00:00", "start.txt") // その日の始まり（含む）
    commitAt(repository, "2026-09-23", "12:00", "noon.txt")
    commitAt(repository, "2026-09-23", "23:59", "end.txt")
    commitAt(repository, "2026-09-24", "00:00", "after.txt") // 次の日の始まり（含まない）

    const achievement = known(await readAchievement(repository, "2026-09-23", "2026-09-24"))

    expect(achievement).toMatchObject({ kind: "known", date: "2026-09-23", commitCount: 3 })
  })

  it("運用の帳面だけを触ったコミットは数えない", async () => {
    commitAt(repository, "2026-09-23", "10:00", "src/work.ts")
    commitOldFormatTasks(repository, "2026-09-23", "11:00", [])
    commitAt(repository, "2026-09-23", "12:00", "develop/progress.md")

    const achievement = known(await readAchievement(repository, "2026-09-23", "2026-09-24"))

    expect(achievement).toMatchObject({ commitCount: 1 })
  })

  it("merge commit は数えない", async () => {
    // 空のリポジトリでは `main` がまだ ref として存在しない（unborn）ので、分岐する前に
    // 1件コミットして `main` を実在させる。
    commitAt(repository, "2026-09-22", "09:00", "base.txt")
    git(repository, "checkout", "-q", "-b", "feature")
    commitAt(repository, "2026-09-23", "09:00", "feature.txt")
    git(repository, "checkout", "-q", "main")
    commitAt(repository, "2026-09-23", "10:00", "main.txt")
    execFileSync("git", ["merge", "--no-ff", "-q", "-m", "merge", "feature"], {
      cwd: repository,
      stdio: "ignore",
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: "2026-09-23T11:00:00+09:00",
        GIT_COMMITTER_DATE: "2026-09-23T11:00:00+09:00",
      },
    })

    const achievement = known(await readAchievement(repository, "2026-09-23", "2026-09-24"))

    // feature.txt と main.txt の2件（merge 自体は数えない）。
    expect(achievement).toMatchObject({ commitCount: 2 })
  })

  it("タスクの記録がどちらの形式も無いリポジトリでは、doneTasks が「数えられない」でコミットは数える", async () => {
    commitAt(repository, "2026-09-23", "10:00", "README.md")

    const achievement = known(await readAchievement(repository, "2026-09-23", "2026-09-24"))

    expect(achievement).toEqual({
      kind: "known",
      date: "2026-09-23",
      today: "2026-09-24",
      commitCount: 1,
      doneTasks: { kind: "unknown" },
    })
  })

  it("新形式: その日の終わりまでに done になったタスクを、前の日には無かった分だけ返す", async () => {
    commitNewFormatTask(repository, "2026-09-22", "10:00", "T-001", "前の日に終わった", "done")
    commitNewFormatTask(repository, "2026-09-23", "09:00", "T-002", "今日終わった", "todo")
    commitAt(
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
    commitNewFormatTask(repository, "2026-09-23", "19:00", "T-003", "今日はまだ", "todo")

    const achievement = known(await readAchievement(repository, "2026-09-23", "2026-09-24"))

    expect(achievement.doneTasks).toEqual({
      kind: "known",
      items: [{ id: "T-002", summary: "今日終わった" }],
    })
  })

  it("旧形式: passes: true の done だけを数え、dropped（done + passes:false）は数えない", async () => {
    commitOldFormatTasks(repository, "2026-09-23", "09:00", [
      { id: "T-001", summary: "todo", status: "todo" },
    ])
    commitOldFormatTasks(repository, "2026-09-23", "18:00", [
      { id: "T-001", summary: "合格", status: "done", passes: true },
      { id: "T-002", summary: "却下", status: "done", passes: false },
    ])

    const achievement = known(await readAchievement(repository, "2026-09-23", "2026-09-24"))

    expect(achievement.doneTasks).toEqual({
      kind: "known",
      items: [{ id: "T-001", summary: "合格" }],
    })
  })

  it("アーカイブ（docs/history/tasks.md）の done も拾う", async () => {
    commitOldFormatTasks(repository, "2026-09-22", "10:00", [
      { id: "T-001", summary: "todo", status: "todo" },
    ])
    const archive = [
      "# 完了タスクのアーカイブ",
      "",
      "## T-001 アーカイブされた完了",
      "",
      "- **difficulty**: `sonnet` / **passes**: `true` / **dependencies**: なし",
    ].join("\n")
    commitAt(repository, "2026-09-23", "18:00", "docs/history/tasks.md", archive)
    // アーカイブしたので旧形式からは消える想定（tasks.json を空にする）。
    commitOldFormatTasks(repository, "2026-09-23", "18:01", [])

    const achievement = known(await readAchievement(repository, "2026-09-23", "2026-09-24"))

    expect(achievement.doneTasks).toEqual({
      kind: "known",
      items: [{ id: "T-001", summary: "アーカイブされた完了" }],
    })
  })

  it("形式の切り替え（新形式への移行）の日は done の集合が変わらないので、その日は0件", async () => {
    commitOldFormatTasks(repository, "2026-09-22", "10:00", [
      { id: "T-001", summary: "旧形式で完了", status: "done", passes: true },
    ])
    // 移行: 旧形式を消し、同じ ID を新形式で done のまま書く。
    git(repository, "rm", "--quiet", "develop/tasks.json")
    execFileSync("git", ["commit", "-q", "-m", "migrate"], {
      cwd: repository,
      stdio: "ignore",
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: "2026-09-23T10:00:00+09:00",
        GIT_COMMITTER_DATE: "2026-09-23T10:00:00+09:00",
      },
    })
    commitNewFormatTask(repository, "2026-09-23", "11:00", "T-001", "旧形式で完了", "done")

    const achievement = known(await readAchievement(repository, "2026-09-23", "2026-09-24"))

    expect(achievement.doneTasks).toEqual({ kind: "known", items: [] })
  })

  it("リポジトリの最初の日（前の日の切り口が無い）は、その日の done を全件返す", async () => {
    commitNewFormatTask(repository, "2026-09-23", "10:00", "T-001", "最初の完了", "done")

    const achievement = known(await readAchievement(repository, "2026-09-23", "2026-09-24"))

    expect(achievement.doneTasks).toEqual({
      kind: "known",
      items: [{ id: "T-001", summary: "最初の完了" }],
    })
  })

  it("date が無ければ今日、指定した日はそのまま見た日として返す", async () => {
    commitAt(repository, "2026-09-20", "10:00", "old.txt")

    const achievement = known(await readAchievement(repository, "2026-09-20", "2026-09-24"))

    expect(achievement).toMatchObject({ date: "2026-09-20", today: "2026-09-24" })
  })

  it("main が無い・git が無いリポジトリでも例外を投げない", async () => {
    await expect(readAchievement(root, "2026-09-24", "2026-09-24")).resolves.toEqual({
      kind: "ok",
      achievement: { kind: "unknown" },
    })
  })
})
