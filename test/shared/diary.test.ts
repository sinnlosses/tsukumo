import { describe, expect, it } from "bun:test"

import { DIARY_VERSION, readDiary, type Diary } from "../../src/shared/diary.ts"

// フィクスチャはすべて手で書いた架空の文面（docs/coding-standards.md「会話内容の扱い」）。

const FIXTURE_DIARY = {
  version: DIARY_VERSION,
  date: "2026-09-23",
  paragraphs: [
    {
      writtenAt: "2026-09-23T21:00:00+09:00",
      body: "架空の本文。",
      expression: "proud",
      writer: { pack: "tsukumo", name: "つくも" },
    },
  ],
  bookmark: {
    kind: "placed",
    taskId: "T-1",
    summary: "架空のタスク",
    reason: "架空の理由",
  },
} satisfies Diary

describe("readDiary", () => {
  it("正しい形はそのまま読む", () => {
    expect(readDiary(FIXTURE_DIARY)).toEqual(FIXTURE_DIARY)
  })

  it("しおりが無い形もそのまま読む", () => {
    const diary = { ...FIXTURE_DIARY, bookmark: { kind: "none" } } satisfies Diary
    expect(readDiary(diary)).toEqual(diary)
  })

  it("段落が2つ以上もそのまま読む", () => {
    const diary = {
      ...FIXTURE_DIARY,
      paragraphs: [
        ...FIXTURE_DIARY.paragraphs,
        {
          writtenAt: "2026-09-23T22:00:00+09:00",
          body: "架空の本文2。",
          expression: "default",
          writer: { pack: "tsukumo", name: "つくも" },
        },
      ],
    } satisfies Diary
    expect(readDiary(diary)).toEqual(diary)
  })

  it("版が違う・段落が0件・形が崩れていれば undefined", () => {
    expect(readDiary({ ...FIXTURE_DIARY, version: 2 })).toBeUndefined()
    expect(readDiary({ ...FIXTURE_DIARY, paragraphs: [] })).toBeUndefined()
    expect(readDiary({ kind: "びっくり" })).toBeUndefined()
    expect(readDiary("日記ではない")).toBeUndefined()
    expect(readDiary(undefined)).toBeUndefined()
  })
})
