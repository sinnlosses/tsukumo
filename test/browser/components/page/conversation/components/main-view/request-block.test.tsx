import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RequestBlock } from "../../../../../../../src/browser/components/page/conversation/components/main-view/request-block.tsx"
import type {
  TaskSummaryItem,
  TaskSummaryResult,
} from "../../../../../../../src/shared/repository/task-summary.ts"
import type { MainViewRequest } from "../../../../../../../src/shared/session/main-view-shape.ts"

// 依頼とタスクはすべて手で書いた架空のもの（実物の会話は使わない）。

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const TASK: TaskSummaryItem = {
  id: "TK-2100",
  summary: "架空のタスクの題",
  status: { kind: "known", status: "todo" },
  dependencies: [],
  waitingFor: [],
  labels: [],
  difficulty: undefined,
  loopable: undefined,
  importance: "normal",
  urgency: "normal",
  body: "",
  location: { kind: "none" },
}

const KNOWN: TaskSummaryResult = { kind: "known", items: [TASK], omittedClosedCount: 0 }
const LOADING: TaskSummaryResult = { kind: "loading" }

function image(id: string): MainViewRequest["images"][number] {
  return { kind: "sent", id, thumbnail: "data:image/png;base64,AAAA" }
}

function renderBlock(
  text: string,
  options: { tasks?: TaskSummaryResult; images?: MainViewRequest["images"] } = {},
): void {
  render(
    <RequestBlock
      request={{ text, images: options.images ?? [] }}
      tasks={options.tasks ?? LOADING}
    />,
  )
}

/** 地の文が2行に収まらず切れていることにする。 */
function pretendClamped(): void {
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(100)
}

describe("RequestBlock", () => {
  it("コマンドとタスクIDだけの依頼は、3つの札だけを出し、地の文と「全文」は出さない", () => {
    pretendClamped()
    renderBlock("/demo-plugin:next-task tk-2100", { tasks: KNOWN })

    expect(screen.getByText("/next-task")).toBeDefined()
    expect(screen.getByText("TK-2100")).toBeDefined()
    expect(screen.getByText("架空のタスクの題")).toBeDefined()
    expect(document.querySelector("p")).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("一覧に無いIDと、一覧が届いていないときは、タスクの札を出さない", () => {
    renderBlock("TK-999 を見て", { tasks: KNOWN })
    expect(screen.queryByText("架空のタスクの題")).toBeNull()
    expect(screen.getByText("TK-999 を見て")).toBeDefined()
    cleanup()

    renderBlock("TK-2100 を見て", { tasks: LOADING })
    expect(screen.queryByText("架空のタスクの題")).toBeNull()
    expect(screen.getByText("TK-2100 を見て")).toBeDefined()
  })

  it("2行に収まる依頼は「全文」を出さない", () => {
    renderBlock("架空の短い依頼")

    expect(screen.getByText("架空の短い依頼")).toBeDefined()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("3行以上で切れている依頼は、「全文」で元の文面を開き、「畳む」で戻る", () => {
    pretendClamped()
    renderBlock("/demo:cmd 架空の1行目\n架空の2行目\n架空の3行目")

    fireEvent.click(screen.getByRole("button", { name: "全文" }))
    expect(document.querySelector("p")?.textContent).toBe(
      "/demo:cmd 架空の1行目\n架空の2行目\n架空の3行目",
    )
    fireEvent.click(screen.getByRole("button", { name: "畳む" }))
    expect(screen.getByRole("button", { name: "全文" })).toBeDefined()
  })

  it("画像は畳んだままで縮小版が見え、「全文」の理由にならない", () => {
    renderBlock("架空の依頼", { images: [image("a")] })

    expect(document.querySelectorAll("img")).toHaveLength(1)
    expect(screen.queryByRole("button", { name: "全文" })).toBeNull()
  })

  it("4枚以上は3枚と「+n」になり、「+n」で開く", () => {
    renderBlock("架空の依頼", { images: [image("a"), image("b"), image("c"), image("d")] })

    expect(document.querySelectorAll("img")).toHaveLength(3)
    fireEvent.click(screen.getByRole("button", { name: "+1" }))
    expect(document.querySelectorAll("img")).toHaveLength(7)
    expect(screen.getByRole("button", { name: "畳む" })).toBeDefined()
  })

  it("ページの h2 はこの塊の1つ", () => {
    renderBlock("/x 架空の依頼", { tasks: KNOWN })

    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1)
  })

  it("狭い画面専用の板を持たない", () => {
    renderBlock("架空の1行目\n架空の2行目")

    expect(document.querySelector("dialog")).toBeNull()
  })
})
