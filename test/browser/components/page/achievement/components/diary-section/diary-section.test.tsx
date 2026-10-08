import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { DiarySection } from "../../../../../../../src/browser/components/page/achievement/components/diary-section/diary-section.tsx"
import type { DiaryWriterPortrait } from "../../../../../../../src/browser/components/page/achievement/domain/diary-writer.ts"
import type {
  AchievementReviewButton,
  AchievementWriting,
  DiarySectionModel,
} from "../../../../../../../src/browser/components/page/achievement/hooks/use-achievement.ts"

/**
 * 日記の区画の見た目だけを測る（`useAchievement` は素通し）。フィクスチャは架空の日記・
 */

afterEach(() => {
  cleanup()
})

const NOOP = (): void => {}

const NO_PORTRAIT: DiaryWriterPortrait = {
  name: "架空の名前",
  portrait: { portraitUrl: undefined, accent: undefined, altText: "架空の名前" },
}

const AVAILABLE_REVIEW: AchievementReviewButton = {
  label: "架空の名前と振り返る",
  availability: { kind: "available" },
  onReview: NOOP,
}

const NOT_WRITING: AchievementWriting = { kind: "none" }

const LOADING = {
  kind: "shown",
  ready: false,
  reviewedLabel: { kind: "none" },
  canOpenBook: false,
  bubble: { kind: "blank" },
  doneTaskCount: "…",
} satisfies DiarySectionModel

const READY_WITH_DIARY = {
  kind: "shown",
  ready: true,
  reviewedLabel: { kind: "shown", label: "振り返り [21:40]" },
  canOpenBook: true,
  bubble: {
    kind: "written",
    key: "2026-09-24-2026-09-24T21:40:00+09:00",
    body: "架空の日記の本文。",
    revisionId: 1,
  },
  doneTaskCount: "1",
} satisfies DiarySectionModel

const READY_NO_DIARY = {
  kind: "shown",
  ready: true,
  reviewedLabel: { kind: "none" },
  canOpenBook: false,
  bubble: { kind: "notes", notes: ["まだこの日の日記は無い。"] },
  doneTaskCount: "1",
} satisfies DiarySectionModel

const READY_EMPTY_DAY = {
  ...READY_NO_DIARY,
  bubble: { kind: "notes", notes: ["この日に終えたタスクは無い。"] },
  doneTaskCount: "0",
} satisfies DiarySectionModel

const WRITE_FAILED = {
  ...READY_NO_DIARY,
  bubble: { kind: "notes", notes: ["日記を書けなかった。もう一度押すと書き直す。"] },
} satisfies DiarySectionModel

function renderSection(overrides: {
  readonly diary?: DiarySectionModel
  readonly writing?: AchievementWriting
  readonly review?: AchievementReviewButton
  readonly reveal?: boolean
  readonly isFetching?: boolean
  readonly onOpenDiaryBook?: () => void
}): ReturnType<typeof render> {
  return render(
    <DiarySection
      diary={overrides.diary ?? READY_NO_DIARY}
      isFetching={overrides.isFetching ?? false}
      writing={overrides.writing ?? NOT_WRITING}
      portrait={NO_PORTRAIT}
      reveal={overrides.reveal ?? false}
      onRevealed={NOOP}
      review={overrides.review ?? AVAILABLE_REVIEW}
      onOpenDiaryBook={overrides.onOpenDiaryBook ?? NOOP}
    />,
  )
}

describe("DiarySection", () => {
  it("取れなかったときは1行だけ", () => {
    renderSection({ diary: { kind: "failed" } })
    expect(screen.getByText("成果を取れなかった。")).toBeDefined()
    expect(document.querySelector(".achievement-card")).toBeNull()
  })

  it("読み込み中は札が「…」で、ボタンは出ない", () => {
    renderSection({ diary: LOADING })

    const values = [...document.querySelectorAll(".achievement-card-value")].map(
      (node) => node.textContent,
    )
    expect(values).toEqual(["…"])
    expect(screen.queryByRole("button", { name: /振り返る/ })).toBeNull()
  })

  it("日記が無い日は、点線の枠に「まだこの日の日記は無い。」", () => {
    renderSection({ diary: READY_NO_DIARY })
    expect(screen.getByText("まだこの日の日記は無い。")).toBeDefined()
    expect(document.querySelector(".achievement-diary-bubble")).toBeNull()
  })

  it("空の日は、吹き出しの場所に終えたタスクが無い旨、ボタンは押せない", () => {
    renderSection({
      diary: READY_EMPTY_DAY,
      review: {
        label: "架空の名前と振り返る",
        availability: { kind: "blocked", reason: "振り返る成果が無い" },
        onReview: NOOP,
      },
    })

    expect(screen.getByText("この日に終えたタスクは無い。")).toBeDefined()
    const button = screen.getByRole("button", { name: "架空の名前と振り返る" })
    expect(button.getAttribute("aria-disabled")).toBe("true")
    expect(screen.getByText("振り返る成果が無い")).toBeDefined()
  })

  it("日記が書き上がっていれば、いちばん新しい段落と時刻を出す", () => {
    renderSection({ diary: READY_WITH_DIARY })

    expect(screen.getByText("架空の日記の本文。")).toBeDefined()
    expect(screen.getByText("振り返り [21:40]")).toBeDefined()
    expect(document.querySelector(".achievement-diary-bubble")).not.toBeNull()
  })

  it("書いている間は進みと「いま書いています…」を出し、ボタンは「振り返り中…」になる", () => {
    renderSection({
      diary: { ...READY_NO_DIARY, bubble: { kind: "notes", notes: [] } },
      writing: { kind: "writing", stage: "write" },
    })

    expect(screen.getByText("いま書いています…")).toBeDefined()
    expect(screen.getByText("この日のタスクを読む")).toBeDefined()
    expect(screen.getByText("日記を書く")).toBeDefined()
    expect(screen.getByText("いちばんを選ぶ")).toBeDefined()
    const button = screen.getByRole("button", { name: "振り返り中…" })
    expect(button.getAttribute("aria-disabled")).toBe("true")
  })

  it("書けなかったときは、書き直しの文言が出てボタンは通常どおり", () => {
    renderSection({
      diary: WRITE_FAILED,
      writing: { kind: "failed" },
    })

    expect(screen.getByText("日記を書けなかった。もう一度押すと書き直す。")).toBeDefined()
    const button = screen.getByRole("button", { name: "架空の名前と振り返る" })
    expect(button.getAttribute("aria-disabled")).toBe("false")
  })

  it("日を切り替えている間は薄く残す", () => {
    renderSection({ diary: READY_WITH_DIARY, isFetching: true })
    expect(document.querySelector(".achievement-diary")?.className).toContain("is-fetching")
  })

  it("押せるときはボタンが出て、押すと onReview が1回呼ばれる", () => {
    let calls = 0
    renderSection({
      diary: READY_WITH_DIARY,
      review: { ...AVAILABLE_REVIEW, onReview: () => (calls += 1) },
    })

    screen.getByRole("button", { name: "架空の名前と振り返る" }).click()
    expect(calls).toBe(1)
  })

  it("日記があれば「日記帳で読む」が出て、押すと onOpenDiaryBook が呼ばれる", () => {
    let calls = 0
    renderSection({ diary: READY_WITH_DIARY, onOpenDiaryBook: () => (calls += 1) })

    screen.getByRole("button", { name: "日記帳で読む" }).click()
    expect(calls).toBe(1)
  })

  it("日記が無い日は「日記帳で読む」を出さない", () => {
    renderSection({ diary: READY_NO_DIARY })
    expect(screen.queryByRole("button", { name: "日記帳で読む" })).toBeNull()
  })
})
