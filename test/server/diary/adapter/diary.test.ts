import { mkdirSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { beforeEach, describe, expect, it } from "vitest"

import { isoWithOffset } from "../../../../src/server/adapter/local-time.ts"
import { tsukumoHomePath } from "../../../../src/server/adapter/tsukumo-home.ts"
import {
  appendDiaryParagraph,
  listDiaryDates,
  readDiaryDay,
} from "../../../../src/server/diary/adapter/diary.ts"
import type { DateKey } from "../../../../src/shared/achievement/achievement.ts"
import { dateKey } from "../../../fixture/date-key.ts"
import { initGitRepository } from "../../../fixture/git-repository.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const DAY_20 = dateKey("2026-09-20")
const DAY_22 = dateKey("2026-09-22")
const DAY_23 = dateKey("2026-09-23")

// 本物の `git` を起こす（リポジトリの見分けそのものが検査の対象）。リポジトリとホームは
// 一時ディレクトリに毎回作る。

const root = useTempDir("diary")
let repository: string
let diary: string

beforeEach(async () => {
  repository = join(root(), "repository")
  diary = tsukumoHomePath("diary", join(root(), "home"))
  await initGitRepository(repository)
})

const WRITER = { pack: "tsukumo", name: "つくも" }

function paragraphInput(date: DateKey, body: string) {
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
    expect(await readDiaryDay(repository, DAY_23, diary)).toEqual({ kind: "none" })
  })

  it("書いたら読める（1段落）", async () => {
    const saved = await appendDiaryParagraph(
      repository,
      paragraphInput(DAY_23, "架空の本文1"),
      diary,
    )

    expect(saved).toBe(true)
    const status = await readDiaryDay(repository, DAY_23, diary)
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
    await appendDiaryParagraph(repository, paragraphInput(DAY_23, "架空の本文1"), diary)
    await appendDiaryParagraph(
      repository,
      {
        ...paragraphInput(DAY_23, "架空の本文2"),
        bookmark: { kind: "placed", taskId: "T-1", summary: "架空のタスク", reason: "架空の理由" },
      },
      diary,
    )

    const status = await readDiaryDay(repository, DAY_23, diary)
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
    const dir = diary
    mkdirSync(dir, { recursive: true })
    // リポジトリの id が分からないとファイル名を組み立てられないので、まず1回書いて置き場を
    // 作り、そのファイルを壊す。
    await appendDiaryParagraph(repository, paragraphInput(DAY_23, "架空の本文1"), diary)
    const repoDirName = readdirSync(dir)[0]
    if (repoDirName === undefined) {
      throw new Error("置き場ができていない")
    }
    const path = join(dir, repoDirName, "2026-09-23.json")
    writeFileSync(path, "これは JSON ではない")

    expect(await readDiaryDay(repository, DAY_23, diary)).toEqual({ kind: "unreadable" })

    const saved = await appendDiaryParagraph(
      repository,
      paragraphInput(DAY_23, "書き直した本文"),
      diary,
    )
    expect(saved).toBe(true)
    const status = await readDiaryDay(repository, DAY_23, diary)
    if (status.kind !== "written") {
      throw new Error("written ではなかった")
    }
    expect(status.diary.paragraphs.map((paragraph) => paragraph.body)).toEqual(["書き直した本文"])
  })

  it("git リポジトリでなければ保存できない・読めない", async () => {
    const notARepository = join(root(), "not-a-repository")
    mkdirSync(notARepository)

    expect(
      await appendDiaryParagraph(notARepository, paragraphInput(DAY_23, "架空の本文"), diary),
    ).toBe(false)
    expect(await readDiaryDay(notARepository, DAY_23, diary)).toEqual({ kind: "none" })
  })

  it("違う日には別のファイルとして残る", async () => {
    await appendDiaryParagraph(repository, paragraphInput(DAY_22, "架空の本文（22日）"), diary)
    await appendDiaryParagraph(repository, paragraphInput(DAY_23, "架空の本文（23日）"), diary)

    const day22 = await readDiaryDay(repository, DAY_22, diary)
    const day23 = await readDiaryDay(repository, DAY_23, diary)
    if (day22.kind !== "written" || day23.kind !== "written") {
      throw new Error("written ではなかった")
    }
    expect(day22.diary.paragraphs[0]?.body).toBe("架空の本文（22日）")
    expect(day23.diary.paragraphs[0]?.body).toBe("架空の本文（23日）")
  })
})

describe("listDiaryDates", () => {
  it("日記の無いリポジトリは空", async () => {
    expect(await listDiaryDates(repository, diary)).toEqual([])
  })

  it("日記のある日を新しい順に返す", async () => {
    await appendDiaryParagraph(repository, paragraphInput(DAY_20, "架空の本文"), diary)
    await appendDiaryParagraph(repository, paragraphInput(DAY_23, "架空の本文"), diary)
    await appendDiaryParagraph(repository, paragraphInput(DAY_22, "架空の本文"), diary)

    expect(await listDiaryDates(repository, diary)).toEqual([DAY_23, DAY_22, DAY_20])
  })
})

describe("リポジトリの見分け", () => {
  it("別のリポジトリの同じ日は混ざらない", async () => {
    const other = join(root(), "other-repository")
    await initGitRepository(other)

    await appendDiaryParagraph(repository, paragraphInput(DAY_23, "こちらのリポジトリ"), diary)
    await appendDiaryParagraph(other, paragraphInput(DAY_23, "あちらのリポジトリ"), diary)

    const fromRepository = await readDiaryDay(repository, DAY_23, diary)
    const fromOther = await readDiaryDay(other, DAY_23, diary)
    if (fromRepository.kind !== "written" || fromOther.kind !== "written") {
      throw new Error("written ではなかった")
    }
    expect(fromRepository.diary.paragraphs[0]?.body).toBe("こちらのリポジトリ")
    expect(fromOther.diary.paragraphs[0]?.body).toBe("あちらのリポジトリ")
  })
})
