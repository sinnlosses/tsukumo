import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  appendDiaryParagraph,
  listDiaryDates,
  readDiaryDay,
} from "../../../src/server/adapter/diary.ts"
import { isoWithOffset } from "../../../src/server/adapter/local-time.ts"

// 本物の `git` を起こす（リポジトリの見分けそのものが検査の対象）。リポジトリとホームは
// 一時ディレクトリに毎回作り、中身は架空の文面だけにする（docs/coding-standards.md「会話内容の
// 扱い」）。

let root: string
let repository: string
let home: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tsukumo-diary-"))
  repository = join(root, "repository")
  home = join(root, "home")
  mkdirSync(repository)
  git(repository, "init", "-q", "-b", "main")
  git(repository, "config", "user.name", "tsukumo-test")
  git(repository, "config", "user.email", "tsukumo-test@example.invalid")
  git(repository, "config", "commit.gpgsign", "false")
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function git(cwd: string, ...args: readonly string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" })
}

const WRITER = { pack: "tsukumo", name: "つくも" }

function paragraphInput(date: string, body: string) {
  return {
    date,
    writtenAtEpochMilliseconds: 1_700_000_000_000,
    body,
    expression: "default",
    writer: WRITER,
    bookmark: { kind: "none" as const },
  }
}

describe("appendDiaryParagraph / readDiaryDay", () => {
  it("書いていない日は none", async () => {
    expect(await readDiaryDay(repository, "2026-09-23", home)).toEqual({ kind: "none" })
  })

  it("書いたら読める（1段落）", async () => {
    const saved = await appendDiaryParagraph(
      repository,
      paragraphInput("2026-09-23", "架空の本文1"),
      home,
    )

    expect(saved).toBe(true)
    const status = await readDiaryDay(repository, "2026-09-23", home)
    expect(status.kind).toBe("written")
    if (status.kind !== "written") {
      throw new Error("written ではなかった")
    }
    expect(status.diary.paragraphs).toEqual([
      {
        writtenAt: isoWithOffset(1_700_000_000_000),
        body: "架空の本文1",
        expression: "default",
        writer: WRITER,
      },
    ])
    expect(status.diary.bookmark).toEqual({ kind: "none" })
  })

  it("同じ日に2回書くと段落が足され、しおりは新しいほうに差し替わる", async () => {
    await appendDiaryParagraph(repository, paragraphInput("2026-09-23", "架空の本文1"), home)
    await appendDiaryParagraph(
      repository,
      {
        ...paragraphInput("2026-09-23", "架空の本文2"),
        bookmark: { kind: "placed", taskId: "T-1", summary: "架空のタスク", reason: "架空の理由" },
      },
      home,
    )

    const status = await readDiaryDay(repository, "2026-09-23", home)
    if (status.kind !== "written") {
      throw new Error("written ではなかった")
    }
    expect(status.diary.paragraphs.map((paragraph) => paragraph.body)).toEqual([
      "架空の本文1",
      "架空の本文2",
    ])
    expect(status.diary.bookmark).toEqual({
      kind: "placed",
      taskId: "T-1",
      summary: "架空のタスク",
      reason: "架空の理由",
    })
  })

  it("壊れたファイルは unreadable。書き足すと新しい1段落だけのファイルで置き換わる", async () => {
    const dir = join(home, "diary")
    mkdirSync(dir, { recursive: true })
    // リポジトリの id が分からないとファイル名を組み立てられないので、まず1回書いて置き場を
    // 作り、そのファイルを壊す。
    await appendDiaryParagraph(repository, paragraphInput("2026-09-23", "架空の本文1"), home)
    const repoDirName = readdirSync(dir)[0]
    if (repoDirName === undefined) {
      throw new Error("置き場ができていない")
    }
    const path = join(dir, repoDirName, "2026-09-23.json")
    writeFileSync(path, "これは JSON ではない")

    expect(await readDiaryDay(repository, "2026-09-23", home)).toEqual({ kind: "unreadable" })

    const saved = await appendDiaryParagraph(
      repository,
      paragraphInput("2026-09-23", "書き直した本文"),
      home,
    )
    expect(saved).toBe(true)
    const status = await readDiaryDay(repository, "2026-09-23", home)
    if (status.kind !== "written") {
      throw new Error("written ではなかった")
    }
    expect(status.diary.paragraphs.map((paragraph) => paragraph.body)).toEqual(["書き直した本文"])
  })

  it("git リポジトリでなければ保存できない・読めない", async () => {
    const notARepository = join(root, "not-a-repository")
    mkdirSync(notARepository)

    expect(
      await appendDiaryParagraph(notARepository, paragraphInput("2026-09-23", "架空の本文"), home),
    ).toBe(false)
    expect(await readDiaryDay(notARepository, "2026-09-23", home)).toEqual({ kind: "none" })
  })

  it("違う日には別のファイルとして残る", async () => {
    await appendDiaryParagraph(repository, paragraphInput("2026-09-22", "架空の本文（22日）"), home)
    await appendDiaryParagraph(repository, paragraphInput("2026-09-23", "架空の本文（23日）"), home)

    const day22 = await readDiaryDay(repository, "2026-09-22", home)
    const day23 = await readDiaryDay(repository, "2026-09-23", home)
    if (day22.kind !== "written" || day23.kind !== "written") {
      throw new Error("written ではなかった")
    }
    expect(day22.diary.paragraphs[0]?.body).toBe("架空の本文（22日）")
    expect(day23.diary.paragraphs[0]?.body).toBe("架空の本文（23日）")
  })
})

describe("listDiaryDates", () => {
  it("日記の無いリポジトリは空", async () => {
    expect(await listDiaryDates(repository, home)).toEqual([])
  })

  it("日記のある日を新しい順に返す", async () => {
    await appendDiaryParagraph(repository, paragraphInput("2026-09-20", "架空の本文"), home)
    await appendDiaryParagraph(repository, paragraphInput("2026-09-23", "架空の本文"), home)
    await appendDiaryParagraph(repository, paragraphInput("2026-09-22", "架空の本文"), home)

    expect(await listDiaryDates(repository, home)).toEqual([
      "2026-09-23",
      "2026-09-22",
      "2026-09-20",
    ])
  })
})

describe("リポジトリの見分け", () => {
  it("別のリポジトリの同じ日は混ざらない", async () => {
    const other = join(root, "other-repository")
    mkdirSync(other)
    git(other, "init", "-q", "-b", "main")
    git(other, "config", "user.name", "tsukumo-test")
    git(other, "config", "user.email", "tsukumo-test@example.invalid")
    git(other, "config", "commit.gpgsign", "false")

    await appendDiaryParagraph(repository, paragraphInput("2026-09-23", "こちらのリポジトリ"), home)
    await appendDiaryParagraph(other, paragraphInput("2026-09-23", "あちらのリポジトリ"), home)

    const fromRepository = await readDiaryDay(repository, "2026-09-23", home)
    const fromOther = await readDiaryDay(other, "2026-09-23", home)
    if (fromRepository.kind !== "written" || fromOther.kind !== "written") {
      throw new Error("written ではなかった")
    }
    expect(fromRepository.diary.paragraphs[0]?.body).toBe("こちらのリポジトリ")
    expect(fromOther.diary.paragraphs[0]?.body).toBe("あちらのリポジトリ")
  })
})
