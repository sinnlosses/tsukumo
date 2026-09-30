import { describe, expect, it } from "vitest"

import {
  applyDiaryEvent,
  DIARY_VERSION,
  readDiary,
  type Diary,
  type DiaryWriting,
} from "../../../src/shared/diary/diary.ts"

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

  it("版が違う・段落が0件・形が崩れていれば undefined", () => {
    expect(readDiary({ ...FIXTURE_DIARY, version: 2 })).toBeUndefined()
    expect(readDiary({ ...FIXTURE_DIARY, paragraphs: [] })).toBeUndefined()
    expect(readDiary({ kind: "びっくり" })).toBeUndefined()
    expect(readDiary("日記ではない")).toBeUndefined()
    expect(readDiary(undefined)).toBeUndefined()
  })
})

describe("applyDiaryEvent", () => {
  const IDLE: DiaryWriting = { kind: "idle" }
  const requested = applyDiaryEvent(IDLE, { kind: "diary-requested", date: "2026-09-23" }, 100)

  it("diary-requested で writing になり、段は read", () => {
    expect(requested).toEqual({
      kind: "writing",
      date: "2026-09-23",
      startedAt: 100,
      stage: "read",
    })
  })

  it("diary-drafting で段が write に進む", () => {
    expect(applyDiaryEvent(requested, { kind: "diary-drafting", toolUseId: "t1" }, 200)).toEqual({
      kind: "writing",
      date: "2026-09-23",
      startedAt: 100,
      stage: "write",
    })
  })

  it("diary-stage で段が pick に進む", () => {
    expect(applyDiaryEvent(requested, { kind: "diary-stage", stage: "pick" }, 300)).toEqual({
      kind: "writing",
      date: "2026-09-23",
      startedAt: 100,
      stage: "pick",
    })
  })

  it("前の段への diary-stage は段を戻さない", () => {
    const picked = applyDiaryEvent(requested, { kind: "diary-stage", stage: "pick" }, 300)

    expect(applyDiaryEvent(picked, { kind: "diary-stage", stage: "read" }, 400)).toEqual(picked)
  })

  it("writing でなければ diary-drafting / diary-stage は姿を変えない", () => {
    expect(applyDiaryEvent(IDLE, { kind: "diary-drafting", toolUseId: "t1" }, 100)).toEqual(IDLE)
    expect(applyDiaryEvent(IDLE, { kind: "diary-stage", stage: "pick" }, 100)).toEqual(IDLE)
  })

  it("diary-written で written になる", () => {
    expect(applyDiaryEvent(requested, { kind: "diary-written", date: "2026-09-23" }, 400)).toEqual({
      kind: "written",
      date: "2026-09-23",
      writtenAt: 400,
    })
  })

  it("diary-failed で failed になる", () => {
    expect(applyDiaryEvent(requested, { kind: "diary-failed", date: "2026-09-23" }, 500)).toEqual({
      kind: "failed",
      date: "2026-09-23",
    })
  })
})
