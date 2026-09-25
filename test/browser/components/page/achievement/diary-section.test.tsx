import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import { DiarySection } from "../../../../../src/browser/components/page/achievement/diary-section.tsx"
import { type DiaryWriterPortrait } from "../../../../../src/browser/components/page/achievement/diary-writer.ts"
import {
  type AchievementReviewButton,
  type AchievementView,
  type AchievementWriting,
} from "../../../../../src/browser/components/page/achievement/hooks/use-achievement.ts"

/**
 * 日記の区画の見た目だけを測る（`use-achievement.ts` は素通し）。フィクスチャは架空の日記・
 * タスク（`docs/coding-standards.md`「会話内容の扱い」）。
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

const READY_WITH_DIARY = {
  kind: "ready",
  commitCount: 4,
  doneTasks: { kind: "known", items: [{ id: "T-1", summary: "架空のタスク" }] },
  graduations: [],
  milestones: [],
  diary: {
    kind: "written",
    diary: {
      version: 1,
      date: "2026-09-24",
      paragraphs: [
        {
          writtenAt: "2026-09-24T21:40:00+09:00",
          body: "架空の日記の本文。",
          expression: "proud",
          writer: { pack: "fixture", name: "架空の名前" },
        },
      ],
      bookmark: { kind: "none" },
    },
  },
} satisfies AchievementView

const READY_NO_DIARY = {
  kind: "ready",
  commitCount: 4,
  doneTasks: { kind: "known", items: [{ id: "T-1", summary: "架空のタスク" }] },
  graduations: [],
  milestones: [],
  diary: { kind: "none" },
} satisfies AchievementView

const READY_EMPTY_DAY = {
  kind: "ready",
  commitCount: 0,
  doneTasks: { kind: "known", items: [] },
  graduations: [],
  milestones: [],
  diary: { kind: "none" },
} satisfies AchievementView

const READY_COMMIT_ONLY = {
  kind: "ready",
  commitCount: 3,
  doneTasks: { kind: "known", items: [] },
  graduations: [],
  milestones: [],
  diary: { kind: "none" },
} satisfies AchievementView

const READY_UNKNOWN_TASKS = {
  kind: "ready",
  commitCount: 2,
  doneTasks: { kind: "unknown" },
  graduations: [],
  milestones: [],
  diary: { kind: "none" },
} satisfies AchievementView

function renderSection(overrides: {
  readonly view?: Exclude<AchievementView, { readonly kind: "unavailable" }>
  readonly writing?: AchievementWriting
  readonly review?: AchievementReviewButton
  readonly reveal?: boolean
  readonly isFetching?: boolean
  readonly onWatchConversation?: () => void
  readonly onOpenDiaryBook?: () => void
}): ReturnType<typeof render> {
  return render(
    <DiarySection
      view={overrides.view ?? READY_NO_DIARY}
      isFetching={overrides.isFetching ?? false}
      writing={overrides.writing ?? NOT_WRITING}
      portrait={NO_PORTRAIT}
      reveal={overrides.reveal ?? false}
      review={overrides.review ?? AVAILABLE_REVIEW}
      onWatchConversation={overrides.onWatchConversation ?? NOOP}
      onOpenDiaryBook={overrides.onOpenDiaryBook ?? NOOP}
    />,
  )
}

describe("DiarySection", () => {
  it("取れなかったときは1行だけ", () => {
    renderSection({ view: { kind: "failed" } })
    expect(screen.getByText("成果を取れなかった。")).toBeDefined()
    expect(document.querySelector(".achievement-card")).toBeNull()
  })

  it("読み込み中は札が「…」で、ボタンは出ない", () => {
    renderSection({ view: { kind: "loading" } })

    const values = [...document.querySelectorAll(".achievement-card-value")].map(
      (node) => node.textContent,
    )
    expect(values).toEqual(["…", "…"])
    expect(screen.queryByRole("button", { name: /振り返る/ })).toBeNull()
  })

  it("日記が無い日は、点線の枠に「まだこの日の日記は無い。」", () => {
    renderSection({ view: READY_NO_DIARY })
    expect(screen.getByText("まだこの日の日記は無い。")).toBeDefined()
    expect(document.querySelector(".achievement-diary-bubble")).toBeNull()
  })

  it("空の日は、吹き出しの場所に成果が無い旨、ボタンは押せない", () => {
    renderSection({
      view: READY_EMPTY_DAY,
      review: {
        label: "架空の名前と振り返る",
        availability: { kind: "blocked", reason: "振り返る成果が無い" },
        onReview: NOOP,
      },
    })

    expect(screen.getByText("この日に main へ入った成果は無い。")).toBeDefined()
    const button = screen.getByRole("button", { name: "架空の名前と振り返る" })
    expect(button.getAttribute("aria-disabled")).toBe("true")
    expect(screen.getByText("振り返る成果が無い")).toBeDefined()
  })

  it("コミットはあり終えたタスクが0でも、ボタンは押せる（しおりの無い日記になる）", () => {
    renderSection({ view: READY_COMMIT_ONLY })

    const button = screen.getByRole("button", { name: "架空の名前と振り返る" })
    expect(button.getAttribute("aria-disabled")).toBe("false")
    expect(screen.getByText("まだこの日の日記は無い。")).toBeDefined()
  })

  it("タスクの記録が無いリポジトリでは、札が「—」で添え書きが出る", () => {
    renderSection({ view: READY_UNKNOWN_TASKS })

    const values = [...document.querySelectorAll(".achievement-card-value")].map(
      (node) => node.textContent,
    )
    expect(values).toEqual(["—", "2"])
    expect(screen.getByText("タスクの記録が無い")).toBeDefined()
  })

  it("日記が書き上がっていれば、いちばん新しい段落と時刻を出す", () => {
    renderSection({ view: READY_WITH_DIARY })

    expect(screen.getByText("架空の日記の本文。")).toBeDefined()
    expect(screen.getByText("振り返り [21:40]")).toBeDefined()
    expect(document.querySelector(".achievement-diary-bubble")).not.toBeNull()
  })

  it("数の札は「終えたタスク」→「コミット」の順で並ぶ", () => {
    renderSection({ view: READY_WITH_DIARY })

    const labels = [...document.querySelectorAll(".achievement-card-label")].map(
      (node) => node.textContent,
    )
    expect(labels).toEqual(["終えたタスク", "コミット"])
  })

  it("書いている間は進みと「いま書いています…」を出し、ボタンは「振り返り中…」になる", () => {
    renderSection({
      view: READY_NO_DIARY,
      writing: { kind: "writing", stage: "write" },
    })

    expect(screen.getByText("いま書いています…")).toBeDefined()
    expect(screen.getByText("この日のタスクを読む")).toBeDefined()
    expect(screen.getByText("日記を書く")).toBeDefined()
    expect(screen.getByText("いちばんを選ぶ")).toBeDefined()
    const button = screen.getByRole("button", { name: "振り返り中…" })
    expect(button.getAttribute("aria-disabled")).toBe("true")
    expect(screen.getByRole("button", { name: "会話の画面で様子を見る ›" })).toBeDefined()
  })

  it("会話の画面で様子を見るを押すと onWatchConversation が呼ばれる", () => {
    let calls = 0
    renderSection({
      view: READY_NO_DIARY,
      writing: { kind: "writing", stage: "read" },
      onWatchConversation: () => (calls += 1),
    })

    screen.getByRole("button", { name: "会話の画面で様子を見る ›" }).click()
    expect(calls).toBe(1)
  })

  it("書いている間、既に日記があれば前の段落を点線の枠に残す", () => {
    renderSection({
      view: READY_WITH_DIARY,
      writing: { kind: "writing", stage: "read" },
    })

    expect(screen.getByText("架空の日記の本文。")).toBeDefined()
    expect(document.querySelector(".achievement-diary-bubble")).toBeNull()
    expect(document.querySelector(".achievement-diary-bubble-empty")).not.toBeNull()
  })

  it("書けなかったときは、書き直しの文言が出てボタンは通常どおり", () => {
    renderSection({
      view: READY_NO_DIARY,
      writing: { kind: "failed" },
    })

    expect(screen.getByText("日記を書けなかった。もう一度押すと書き直す。")).toBeDefined()
    const button = screen.getByRole("button", { name: "架空の名前と振り返る" })
    expect(button.getAttribute("aria-disabled")).toBe("false")
  })

  it("日を切り替えている間は薄く残す", () => {
    renderSection({ view: READY_WITH_DIARY, isFetching: true })
    expect(document.querySelector(".achievement-diary")?.className).toContain("is-fetching")
  })

  it("押せるときはボタンが出て、押すと onReview が1回呼ばれる", () => {
    let calls = 0
    renderSection({
      view: READY_WITH_DIARY,
      review: { ...AVAILABLE_REVIEW, onReview: () => (calls += 1) },
    })

    screen.getByRole("button", { name: "架空の名前と振り返る" }).click()
    expect(calls).toBe(1)
  })

  it("日記があれば「日記帳で読む」が出て、押すと onOpenDiaryBook が呼ばれる", () => {
    let calls = 0
    renderSection({ view: READY_WITH_DIARY, onOpenDiaryBook: () => (calls += 1) })

    screen.getByRole("button", { name: "日記帳で読む" }).click()
    expect(calls).toBe(1)
  })

  it("日記が無い日は「日記帳で読む」を出さない", () => {
    renderSection({ view: READY_NO_DIARY })
    expect(screen.queryByRole("button", { name: "日記帳で読む" })).toBeNull()
  })
})
