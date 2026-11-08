import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { AskThreadContext } from "../../../../../src/browser/features/report/ask-thread-context.ts"
import {
  askLeafKey,
  type LeafAskThread,
} from "../../../../../src/browser/features/report/domain/ask-thread.ts"
import { loadMarkdown } from "../../../../../src/browser/features/report/markdown.tsx"
import {
  type ReplyPort,
  ReplyPortContext,
  type ReplyPortSlot,
} from "../../../../../src/browser/features/report/reply-port.ts"
import { Report } from "../../../../../src/browser/features/report/report.tsx"
import { reportEvents } from "../../../../../src/server/session-driver/core/message/sdk-report-message.ts"
import { mainViewEntries } from "../../../../../src/shared/session/main-view-entry.ts"
import type { MainViewReportRegions } from "../../../../../src/shared/session/main-view-shape.ts"
import { applySessionEvent } from "../../../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session/session-state.ts"
import { checkedToolUseId } from "../../../../fixture/tool-use-id.ts"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

const ROWS = [
  ["ぼ", "甲", "10"],
  ["あ", "乙", "9"],
  ["ん", "甲", "100"],
]

function reportParts(table: Readonly<Record<string, unknown>>, withPicker = true) {
  return [
    { id: "root", component: "Report", conclusion: ["架空の結論。"], children: ["s1"] },
    {
      id: "s1",
      component: "Section",
      heading: "架空の操作",
      children: withPicker ? ["pick", "t1"] : ["t1"],
    },
    {
      id: "pick",
      component: "ChoicePicker",
      label: "架空の種別",
      options: [
        { label: "甲", value: "甲" },
        { label: "乙", value: "乙" },
        { label: "丙", value: "丙" },
      ],
      value: { path: "/view/t1/filter" },
    },
    {
      id: "t1",
      component: "Table",
      title: "架空の表",
      columns: ["架空の名", "架空の種別", "架空の数"],
      rows: ROWS,
      ...table,
    },
  ].filter((part) => withPicker || part.id !== "pick")
}

const INTERACTIVE = { sortable: true, filterable: true }

function regionsOf(components: readonly unknown[]): MainViewReportRegions {
  const [event] = reportEvents(checkedToolUseId("toolu_fictional"), { components }, [])
  if (event?.kind !== "report") throw new Error("report にならなかった")
  const entry = mainViewEntries(applySessionEvent(INITIAL_SESSION_STATE, event, 0)).find(
    (candidate) => candidate.kind === "report",
  )
  if (entry?.kind !== "report") throw new Error("レポートの記録が無い")
  return entry.regions
}

function renderRegions(body: MainViewReportRegions) {
  return render(
    <Report
      reveal={false}
      turnId={1}
      className=""
      revealClassName=""
      blockClassName=""
      body={body}
    />,
  )
}

function names(container: HTMLElement): readonly string[] {
  return [...container.querySelectorAll("tbody tr")].map(
    (row) => row.firstElementChild?.textContent ?? "",
  )
}

function renderAskable(options: { readonly port: boolean; readonly reportToolUseId?: string }) {
  const ask = vi.fn<ReplyPort["ask"]>()
  const slot: ReplyPortSlot = options.port
    ? { kind: "open", port: { appendDraft: vi.fn<ReplyPort["appendDraft"]>(), ask } }
    : { kind: "none" }
  const body = regionsOf(reportParts(INTERACTIVE, false))
  const view = render(
    <ReplyPortContext value={slot}>
      <Report
        reveal={false}
        turnId={1}
        className=""
        revealClassName=""
        blockClassName=""
        body={body}
        reportToolUseId={options.reportToolUseId}
      />
    </ReplyPortContext>,
  )
  return { ask, ...view }
}

describe("表の行の「聞く」", () => {
  it("口と report の id があれば本体の行ごとに出て、見出しの行には出ない", () => {
    const { container } = renderAskable({ port: true, reportToolUseId: "toolu_1" })

    expect(screen.getAllByRole("button", { name: /について聞く$/ })).toHaveLength(ROWS.length)
    expect(container.querySelectorAll("thead button[aria-label$='について聞く']")).toHaveLength(0)
    expect(container.querySelectorAll("thead th")).toHaveLength(4)
  })

  it("口が無いか、report の id が無ければ出ない", () => {
    renderAskable({ port: false, reportToolUseId: "toolu_1" })
    expect(screen.queryAllByRole("button", { name: /聞く/ })).toHaveLength(0)
    cleanup()

    renderAskable({ port: true })
    expect(screen.queryAllByRole("button", { name: /聞く/ })).toHaveLength(0)
  })

  it("並べ替えたあとの行を押しても、行の添字は書いた並びのまま届き、1列目の字が label.row に入る", () => {
    const { ask } = renderAskable({ port: true, reportToolUseId: "toolu_1" })

    fireEvent.click(screen.getByRole("button", { name: /架空の数/ }))
    fireEvent.click(screen.getByRole("button", { name: "あについて聞く" }))
    const field = screen.getByRole("textbox")
    fireEvent.change(field, { target: { value: "なぜ？" } })
    fireEvent.keyDown(field, { key: "Enter", metaKey: true })

    expect(ask).toHaveBeenCalledExactlyOnceWith(
      {
        label: { section: "架空の操作", component: "架空の表", row: "あ" },
        key: { reportToolUseId: "toolu_1", componentId: "t1", rowIndex: 1 },
      },
      "なぜ？",
    )
  })

  it("入力欄は表の中で1つだけ開く（部品全体の欄と行の欄が取り合う）", () => {
    renderAskable({ port: true, reportToolUseId: "toolu_1" })

    fireEvent.click(screen.getByRole("button", { name: "聞く" }))
    expect(screen.getAllByRole("textbox")).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "ぼについて聞く" }))

    expect(screen.getAllByRole("textbox")).toHaveLength(1)
    expect(screen.getByText(/指した所: .* › ぼ$/)).toBeTruthy()
  })

  it("行の欄は表の下に開き、表は割れず、指した行に印が付く", () => {
    const { container } = renderAskable({ port: true, reportToolUseId: "toolu_1" })

    fireEvent.click(screen.getByRole("button", { name: "ぼについて聞く" }))

    const field = screen.getByRole("textbox")
    const table = container.querySelector("table")
    expect(table?.contains(field)).toBe(false)
    expect(table?.compareDocumentPosition(field)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(container.querySelectorAll("tbody tr[class*='ask-row-active']")).toHaveLength(1)
  })
})

describe("表の行に聞いた印", () => {
  it("聞いた行にだけ印の線が付き、その行の対が表の下に出る", () => {
    const thread: LeafAskThread = {
      pairs: [
        {
          question: "なぜ？",
          answer: { kind: "answered", text: "架空の理由。" },
          row: { index: 1, label: "あ" },
        },
      ],
      waiting: false,
      count: 1,
    }
    const body = regionsOf(reportParts(INTERACTIVE, false))
    const { container } = render(
      <ReplyPortContext
        value={{
          kind: "open",
          port: { appendDraft: vi.fn<ReplyPort["appendDraft"]>(), ask: vi.fn<ReplyPort["ask"]>() },
        }}
      >
        <AskThreadContext
          value={{
            kind: "grouped",
            byLeaf: new Map([[askLeafKey("toolu_1", "t1"), thread]]),
            remaining: [],
          }}
        >
          <Report
            reveal={false}
            turnId={1}
            className=""
            revealClassName=""
            blockClassName=""
            body={body}
            reportToolUseId="toolu_1"
          />
        </AskThreadContext>
      </ReplyPortContext>,
    )

    const asked = container.querySelectorAll("tbody tr[class*='ask-row-asked']")
    expect(asked).toHaveLength(1)
    expect(asked[0]?.firstElementChild?.textContent).toBe("あ")
    expect(screen.getByText("なぜ？")).toBeTruthy()
    expect(container.textContent).toContain("聞 1・答えた")
  })
})

describe("操作できる Table", () => {
  it("全行を見せているときの表は、操作できない Table と同じ DOM", () => {
    const interactive = renderRegions(regionsOf(reportParts({ filterable: true }, false)))
    const shown = interactive.container.querySelector(
      "[data-report-region] .table-scroll",
    )?.outerHTML
    cleanup()
    const plain = renderRegions(regionsOf(reportParts({}, false)))

    expect(shown).toBeDefined()
    expect(shown).toBe(
      plain.container.querySelector("[data-report-region] .table-scroll")?.outerHTML,
    )
  })

  it("見出しを押すと昇順 → 降順 → 元の順に並ぶ", () => {
    const { container } = renderRegions(regionsOf(reportParts(INTERACTIVE)))
    expect(names(container)).toEqual(["ぼ", "あ", "ん"])
    expect(screen.queryByRole("group", { name: "並べ替え" })).toBeNull()
    const heading = () => screen.getByRole("columnheader", { name: /架空の数/ })
    expect(heading().getAttribute("aria-sort")).toBe("none")

    fireEvent.click(within(heading()).getByRole("button"))
    expect(names(container)).toEqual(["あ", "ぼ", "ん"])
    expect(heading().getAttribute("aria-sort")).toBe("ascending")
    expect(heading().textContent).toContain("▲")

    fireEvent.click(within(heading()).getByRole("button"))
    expect(names(container)).toEqual(["ん", "ぼ", "あ"])
    expect(heading().getAttribute("aria-sort")).toBe("descending")
    expect(heading().textContent).toContain("▼")

    fireEvent.click(within(heading()).getByRole("button"))
    expect(names(container)).toEqual(["ぼ", "あ", "ん"])
    expect(heading().getAttribute("aria-sort")).toBe("none")
    expect(heading().textContent).not.toMatch(/[▲▼]/)
  })

  it("6 行の表は sortable を書かなくても見出しのボタンで並べ替えられ、false なら付かない", () => {
    const rows = ["ぼ", "あ", "ん", "う", "え", "お"].map((name, i) => [name, "甲", String(i)])
    const { container } = renderRegions(regionsOf(reportParts({ rows }, false)))

    fireEvent.click(screen.getByRole("button", { name: "架空の名" }))
    expect(names(container)).toEqual(["あ", "う", "え", "お", "ぼ", "ん"])
    cleanup()

    renderRegions(regionsOf(reportParts({ rows, sortable: false }, false)))
    expect(screen.queryAllByRole("button")).toEqual([])
  })

  it("並べ替えられない表の見出しには aria-sort もボタンも付けない", () => {
    const { container } = renderRegions(regionsOf(reportParts({ filterable: true }, false)))

    expect(container.querySelector("thead th[aria-sort]")).toBeNull()
    expect(container.querySelector("thead button")).toBeNull()
  })

  it("絞り込んでも、数の棒は全行の最大値に照らしたまま", () => {
    const { container } = renderRegions(regionsOf(reportParts(INTERACTIVE)))

    fireEvent.click(screen.getByRole("button", { name: "乙" }))

    expect(names(container)).toEqual(["あ"])
    expect(container.querySelector("tbody [style*='width']")?.getAttribute("style")).toContain("9%")
  })

  it("どの行にも当たらなければ、見出しの行だけの表と「該当する行はありません」が出る", () => {
    const { container } = renderRegions(regionsOf(reportParts(INTERACTIVE)))

    fireEvent.click(screen.getByRole("button", { name: "丙" }))

    expect(container.querySelector("tbody")).toBeNull()
    expect([...container.querySelectorAll("thead th")].map((cell) => cell.textContent)).toEqual([
      "架空の名",
      "架空の種別",
      "架空の数",
    ])
    expect(screen.getByText("該当する行はありません")).toBeTruthy()
  })

  it("結んだ ChoicePicker が無い表は値と件数のバッジを出し、押すと絞り、もう一度押すと全行に戻る", () => {
    const rows = [
      ["ぼ", "甲", "1"],
      ["あ", "乙", "2"],
      ["ん", "甲", "3"],
    ]
    const { container } = renderRegions(
      regionsOf(reportParts({ ...INTERACTIVE, rows, filterColumn: 1 }, false)),
    )
    const badges = screen.getByRole("group", { name: "絞り込み" })
    const caption = badges.parentElement
    expect(caption?.textContent).toContain("架空の表")
    expect(container.querySelector("table")?.parentElement?.previousElementSibling).toBe(caption)

    fireEvent.click(screen.getByRole("button", { name: "甲 2件" }))
    expect(names(container)).toEqual(["ぼ", "ん"])

    fireEvent.click(screen.getByRole("button", { name: "甲 2件" }))
    expect(names(container)).toEqual(["ぼ", "あ", "ん"])
  })

  it("結んだ ChoicePicker がある表・filterColumn が無い表・値が 1 種類の表はバッジを出さない", () => {
    const bound = renderRegions(regionsOf(reportParts({ ...INTERACTIVE, filterColumn: 1 }, true)))
    expect(screen.queryByRole("group", { name: "絞り込み" })).toBeNull()
    expect(bound.container.querySelector("button")).not.toBeNull()
    cleanup()

    renderRegions(regionsOf(reportParts(INTERACTIVE, false)))
    expect(screen.queryByRole("group", { name: "絞り込み" })).toBeNull()
    cleanup()

    const same = ["ぼ", "甲", "1"]
    renderRegions(
      regionsOf(reportParts({ ...INTERACTIVE, rows: [same, same], filterColumn: 1 }, false)),
    )
    expect(screen.queryByRole("group", { name: "絞り込み" })).toBeNull()
  })

  it("10 行を超える表で「ほか n 件」を押したあとに並べ替えても、展開は保たれる", () => {
    const many = Array.from({ length: 12 }, (_, index) => [
      `行${String(index + 1)}`,
      "甲",
      String(index + 1),
    ])
    const { container } = renderRegions(regionsOf(reportParts({ ...INTERACTIVE, rows: many })))
    expect(names(container)).toHaveLength(11)

    fireEvent.click(screen.getByRole("button", { name: /ほか 2 件/ }))
    fireEvent.click(screen.getByRole("button", { name: "架空の数" }))

    expect(names(container)).toHaveLength(12)
  })
})
