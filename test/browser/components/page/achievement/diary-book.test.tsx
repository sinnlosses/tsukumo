import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { DiaryBook } from "../../../../../src/browser/components/page/achievement/diary-book.tsx"
import {
  type DiaryBookModel,
  type DiaryBookPage,
} from "../../../../../src/browser/components/page/achievement/hooks/use-diary-book.ts"

/**
 * 見開きの見た目だけを測る（`use-diary-book.ts` は素通し）。フィクスチャは架空の日記・タスク
 * （`docs/coding-standards.md`「会話内容の扱い」）。
 */

afterEach(() => {
  cleanup()
})

const NOOP = (): void => {}
const NOOP_DATE = (_date: string): void => {}

const NO_PORTRAIT = { portraitUrl: undefined, accent: undefined, altText: "架空の名前" }

const WRITTEN_PAGE: DiaryBookPage = {
  kind: "ready",
  date: "2026-09-16",
  kanjiDate: "九月十六日",
  weekday: "水曜日",
  lampLabel: "灯り　明るい",
  bookmark: { kind: "placed", taskId: "T-1", summary: "架空のタスク", reason: "架空の理由" },
  tasks: {
    items: [{ id: "T-1", summary: "架空のタスク" }],
    moreCount: 0,
    commitCount: 5,
    tasksKnown: true,
  },
  badges: [
    { kind: "graduation", key: "graduation-T-2", taskId: "T-2" },
    { kind: "milestone", key: "milestone-commit-14:12", countLabel: "千", unitLabel: "コミット目" },
  ],
  right: {
    kind: "written",
    paragraphs: [
      { key: "p0", body: "架空の日記の本文1。", timeLabel: undefined },
      { key: "p1", body: "架空の日記の本文2。", timeLabel: "〔22:10〕" },
    ],
  },
  portraitName: "架空の名前",
  portrait: NO_PORTRAIT,
}

const BLANK_PAGE: DiaryBookPage = {
  kind: "ready",
  date: "2026-09-23",
  kanjiDate: "九月二十三日",
  weekday: "水曜日",
  lampLabel: "灯り　明るい",
  bookmark: { kind: "pending" },
  tasks: { items: [], moreCount: 0, commitCount: 4, tasksKnown: true },
  badges: [],
  right: {
    kind: "blank",
    review: { label: "この日を振り返る", availability: { kind: "available" }, onReview: NOOP },
  },
  portraitName: "架空の名前",
  portrait: NO_PORTRAIT,
}

/** 描く。開閉・Esc・backdrop のクリックは `<Dialog>`（`components/ui/dialog/dialog.tsx`）が持つ。 */
function renderBook(model: DiaryBookModel): ReturnType<typeof render> {
  return render(<DiaryBook {...model} />)
}

function openModel(overrides: Partial<DiaryBookModel> = {}): DiaryBookModel {
  return {
    open: true,
    openNote: "灯りの暦から開きました",
    page: WRITTEN_PAGE,
    previous: { date: "2026-08-30", label: "8月30日" },
    next: { date: "2026-09-24", label: "9月24日" },
    toc: { open: false, months: [] },
    onOpenFromCalendar: NOOP_DATE,
    onOpenFromDiarySection: NOOP,
    onPrevious: NOOP,
    onNext: NOOP,
    onToggleToc: NOOP,
    onSelectTocDate: NOOP_DATE,
    onClose: NOOP,
    ...overrides,
  }
}

describe("DiaryBook", () => {
  it("閉じているときは中身を描かない", () => {
    renderBook(openModel({ open: false }))
    expect(screen.queryByText("つくもの日記帳")).toBeNull()
  })

  it("開いていれば題・添え書き・前後の送りを出す", () => {
    renderBook(openModel())
    expect(screen.getByText("つくもの日記帳")).toBeDefined()
    expect(screen.getByText("灯りの暦から開きました")).toBeDefined()
    expect(screen.getByRole("button", { name: /8月30日/ })).toBeDefined()
    expect(screen.getByRole("button", { name: /9月24日/ })).toBeDefined()
  })

  it("前後の日記が無ければ、その向きは aria-disabled", () => {
    renderBook(openModel({ previous: undefined, next: undefined }))
    expect(screen.getByRole("button", { name: /前の日/ }).getAttribute("aria-disabled")).toBe(
      "true",
    )
    expect(screen.getByRole("button", { name: /次の日/ }).getAttribute("aria-disabled")).toBe(
      "true",
    )
  })

  it("閉じるボタンを押すと onClose が呼ばれる", () => {
    let calls = 0
    renderBook(openModel({ onClose: () => (calls += 1) }))
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }))
    expect(calls).toBe(1)
  })

  it("Esc（<dialog> の close イベント）でも onClose が呼ばれる", () => {
    let calls = 0
    renderBook(openModel({ onClose: () => (calls += 1) }))
    const dialog = document.querySelector("dialog")
    if (dialog === null) {
      throw new Error("<dialog> が無い")
    }
    fireEvent(dialog, new Event("close"))
    expect(calls).toBe(1)
  })

  it("枠の外（backdrop）を押すと onClose が呼ばれる", () => {
    let calls = 0
    renderBook(openModel({ onClose: () => (calls += 1) }))
    const dialog = document.querySelector("dialog")
    if (dialog === null) {
      throw new Error("<dialog> が無い")
    }
    fireEvent.click(dialog)
    expect(calls).toBe(1)
  })

  it("書かれた日は段落を書いた順に並べ、2つ目以降だけ時刻が付く", () => {
    renderBook(openModel())
    expect(screen.getByText("架空の日記の本文1。")).toBeDefined()
    expect(screen.getByText("架空の日記の本文2。")).toBeDefined()
    expect(screen.getByText("〔22:10〕")).toBeDefined()
  })

  it("しおりがあれば ID・要約・理由を出す", () => {
    renderBook(openModel())
    expect(screen.getByText("しおり ── この日のいちばん")).toBeDefined()
    expect(document.querySelector(".diary-book-bookmark-task-id")?.textContent).toBe("T-1")
    expect(screen.getByText("「架空の理由」")).toBeDefined()
  })

  it("しおりが none の日は、しおりの区画ごと出さない", () => {
    renderBook(openModel({ page: { ...WRITTEN_PAGE, bookmark: { kind: "none" } } }))
    expect(screen.queryByText("しおり ── この日のいちばん")).toBeNull()
  })

  it("書いたパックが一覧に無いときは、名前だけ出て顔は出さない", () => {
    renderBook(openModel())
    expect(screen.getByText("架空の名前")).toBeDefined()
    expect(document.querySelector(".diary-book-signature-image")).toBeNull()
  })

  it("卒業・節目の丸い印が出る", () => {
    renderBook(openModel())
    expect(screen.getByText("卒業")).toBeDefined()
    expect(screen.getByText("T-2")).toBeDefined()
    expect(screen.getByText("千")).toBeDefined()
    expect(screen.getByText("コミット目")).toBeDefined()
  })

  it("白紙の日は「このページは、まだ白紙。」と「この日を振り返る」を出す", () => {
    renderBook(openModel({ page: BLANK_PAGE }))
    expect(screen.getByText("このページは、まだ白紙。")).toBeDefined()
    const button = screen.getByRole("button", { name: "この日を振り返る" })
    expect(button.getAttribute("aria-disabled")).toBe("false")
  })

  it("白紙の日の「この日を振り返る」を押すと onReview が呼ばれる", () => {
    let calls = 0
    const pressable: DiaryBookPage = {
      ...BLANK_PAGE,
      right: {
        kind: "blank",
        review: {
          label: "この日を振り返る",
          availability: { kind: "available" },
          onReview: () => (calls += 1),
        },
      },
    }
    renderBook(openModel({ page: pressable }))
    fireEvent.click(screen.getByRole("button", { name: "この日を振り返る" }))
    expect(calls).toBe(1)
  })

  it("押せない白紙の日は aria-disabled で、理由を添える", () => {
    const blocked: DiaryBookPage = {
      ...BLANK_PAGE,
      right: {
        kind: "blank",
        review: {
          label: "この日を振り返る",
          availability: { kind: "blocked", reason: "振り返る成果が無い" },
          onReview: NOOP,
        },
      },
    }
    renderBook(openModel({ page: blocked }))
    const button = screen.getByRole("button", { name: "この日を振り返る" })
    expect(button.getAttribute("aria-disabled")).toBe("true")
    expect(screen.getByText("振り返る成果が無い")).toBeDefined()
  })

  it("目次を開くと月ごとに並び、選ぶと onSelectTocDate が呼ばれる", () => {
    const selected: string[] = []
    renderBook(
      openModel({
        toc: {
          open: true,
          months: [
            { heading: "2026年9月", days: [{ date: "2026-09-16", label: "9月16日（水）" }] },
            { heading: "2026年8月", days: [{ date: "2026-08-20", label: "8月20日（木）" }] },
          ],
        },
        onSelectTocDate: (date) => selected.push(date),
      }),
    )

    expect(screen.getByText("2026年9月")).toBeDefined()
    expect(screen.getByText("2026年8月")).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: "9月16日（水）" }))
    expect(selected).toEqual(["2026-09-16"])
  })

  it("目次を開いていないときは出さない", () => {
    renderBook(openModel())
    expect(screen.queryByRole("dialog", { name: "目次" })).toBeNull()
  })

  it("読み込み中・取れなかったときは1行だけ", () => {
    renderBook(openModel({ page: { kind: "loading" } }))
    expect(screen.getByText("…")).toBeDefined()

    cleanup()
    renderBook(openModel({ page: { kind: "failed" } }))
    expect(screen.getByText("成果を取れなかった。")).toBeDefined()
  })
})
