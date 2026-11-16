import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useComposerDraft } from "../../../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"
import { useTaskBoardRequest } from "../../../../../../../src/browser/stores/task-board-request.ts"
import type { ReportChangeSummary } from "../../../../../../../src/shared/report/report-change-summary.ts"
import type {
  MainViewQuestion,
  MainViewReportBody,
  MainViewStep,
  MainViewStepBody,
} from "../../../../../../../src/shared/session/main-view-shape.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { bodyTextOf } from "../../../../../../fixture/main-view-entry.ts"
import {
  reportRecord,
  requestRecord,
  speechRecord,
} from "../../../../../../fixture/session-record.ts"
import { step, TURN_ID, turn, turnBodyText } from "../../../../../../fixture/turn.ts"
import { typedElement } from "../../../../../../typed-element.ts"
import { putSession } from "../../../../../session-store.ts"

// 本物の `Report`（react-markdown 一式と演出の配線を持つ）ではなく、本文だけを描く代役に差し替える。
vi.mock("../../../../../../../src/browser/features/report/report.tsx", () => ({
  Report: (props: { readonly body: MainViewReportBody; readonly nextSteps?: unknown }) => (
    <div data-report-stub="yes" data-next-steps={props.nextSteps === undefined ? "no" : "yes"}>
      {bodyTextOf(props.body)}
    </div>
  ),
}))

const { Turn } =
  await import("../../../../../../../src/browser/components/page/conversation/components/main-view/turn.tsx")

function toggleDetails(details: Element, open: boolean): void {
  const element = typedElement(details, HTMLDetailsElement, "畳み")
  element.open = open
  fireEvent(element, new Event("toggle"))
}

afterEach(() => {
  cleanup()
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
  useTaskBoardRequest.setState(useTaskBoardRequest.getInitialState(), true)
})

describe("Turn（次の一手の行）", () => {
  function reportStep(id: number, mark: MainViewStep["mark"]): MainViewStep {
    const body: MainViewStepBody = {
      kind: "text",
      report: { kind: "markdown", markdown: `架空の本文${id}` },
      firstLine: `架空の本文${id}`,
      task: { kind: "none" },
      finishedPhase: { kind: "none" },
      changeSummary: { kind: "none" },
      sessionRemaining: { kind: "remaining", text: "架空の残り" },
    }
    return step({ id, body, mark })
  }

  const nextStepsOf = (container: HTMLElement): (string | null)[] =>
    [...container.querySelectorAll("[data-report-stub]")].map((stub) =>
      stub.getAttribute("data-next-steps"),
    )

  it("いちばん新しいやり取りの最後のレポートにだけ渡す", () => {
    putSession(INITIAL_SESSION_STATE)
    const steps = [reportStep(0, "interim-kept"), reportStep(1, "final")]
    const newest = render(<Turn turn={turn(steps)} newest freshReport={false} />)
    const newestMarks = nextStepsOf(newest.container)
    cleanup()
    const past = render(<Turn turn={turn(steps)} newest={false} freshReport={false} />)

    expect(newestMarks.filter((mark) => mark === "yes")).toHaveLength(1)
    expect(nextStepsOf(past.container)).not.toContain("yes")
  })
})

describe("Turn（タスク見出し行と見出し）", () => {
  const TASK = {
    kind: "task",
    id: "X-7",
    name: "架空の作業 `a/b` を直す",
    outcome: "finished",
    genre: "work",
  } as const

  function taskBody(
    report: string,
    changeSummary: ReportChangeSummary = { kind: "none" },
  ): MainViewStepBody {
    return {
      kind: "text",
      report: { kind: "markdown", markdown: report },
      firstLine: report,
      task: TASK,
      finishedPhase: { kind: "none" },
      changeSummary,
    }
  }

  it("一覧に無いタスクの ID は押せない", () => {
    putSession(INITIAL_SESSION_STATE)
    render(
      <Turn
        turn={turn([step({ id: 0, body: taskBody("架空の本文"), mark: "final" })])}
        newest
        freshReport={false}
      />,
    )

    expect(screen.queryByRole("button", { name: "X-7" })).toBeNull()
  })

  it("変更のラベルが数を持っても、タスク見出し行のメタの行に「変更」は出ない", () => {
    putSession(INITIAL_SESSION_STATE)
    const body = taskBody("架空の本文", {
      kind: "counted",
      changed: [],
      files: 3,
      added: 12,
      removed: 4,
      mixed: false,
    })
    const { container } = render(
      <Turn turn={turn([step({ id: 0, body, mark: "final" })])} newest freshReport={false} />,
    )

    expect(container.querySelector("header > p")?.textContent).toBe("最終レポート")
  })

  it("一覧にあるタスクの ID を押すと、そのタスクを選んでタスクのモーダルを開くよう頼む", () => {
    putSession({
      ...INITIAL_SESSION_STATE,
      tasks: {
        kind: "known",
        omittedClosedCount: 0,
        items: [
          {
            id: "X-7",
            summary: "架空のタスク",
            status: { kind: "known", status: "done" },
            dependencies: [],
            waitingFor: [],
            labels: [],
            difficulty: undefined,
            loopable: undefined,
            importance: "normal",
            urgency: "normal",
            body: "",
            location: { kind: "none" },
          },
        ],
      },
    })
    render(
      <Turn
        turn={turn([step({ id: 0, body: taskBody("架空の本文"), mark: "final" })])}
        newest
        freshReport={false}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "X-7" }))

    expect(useTaskBoardRequest.getState().request).toEqual({
      kind: "open",
      focus: { kind: "task", id: "X-7" },
      query: "",
    })
  })

  it.each([
    ["finished", "X-7架空の作業 a/b を直す✓ 完了"],
    ["awaiting-answer", "X-7架空の作業 a/b を直す？ 答え待ち"],
    ["stopped", "X-7架空の作業 a/b を直す"],
  ] as const)("終わり方 %s のタスク見出し行は「%s」で、見出しは作業の名前", (outcome, titleRow) => {
    putSession(INITIAL_SESSION_STATE)
    const body: MainViewStepBody = {
      kind: "text",
      report: { kind: "markdown", markdown: "架空の本文" },
      firstLine: "架空の本文",
      task: { ...TASK, outcome },
      finishedPhase: { kind: "none" },
      changeSummary: { kind: "none" },
    }
    const { container } = render(
      <Turn turn={turn([step({ id: 0, body })])} newest freshReport={false} />,
    )

    expect(container.querySelector("header > div")?.textContent).toBe(titleRow)
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("架空の作業 a/b を直す")
  })
})

describe("Turn（畳んだ中間レポートの見出し）", () => {
  function phaseStep(id: number, skipped: boolean): MainViewStep {
    return step({
      id,
      mark: "interim-folded",
      body: {
        kind: "text",
        report: { kind: "markdown", markdown: "架空のまとめ" },
        firstLine: `${String(id + 1)}/2 架空の段`,
        task: { kind: "none" },
        finishedPhase: {
          kind: "phase",
          label: `${String(id + 1)}/2 架空の段`,
          duration: { kind: "known", milliseconds: 0 },
          skipped,
        },
        changeSummary: { kind: "none" },
      },
    })
  }

  it("飛ばした段の <summary> は所要の前に「飛ばした」を出し、済んだ段は出さない", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container } = render(
      <Turn
        turn={turn([phaseStep(0, false), phaseStep(1, true), step({ id: 2, mark: "final" })])}
        newest
        freshReport={false}
      />,
    )

    expect(
      [...container.querySelectorAll("details.is-interim > summary")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["✓ 1/2 架空の段 所要 0秒", "－ 2/2 架空の段 飛ばした 所要 0秒"])
  })
})

describe("Turn（組の入れ物）", () => {
  it("投稿は単独の組になり、札は前のセリフと同じ組に入って、前のセリフより前は別の組になる", () => {
    putSession({
      ...INITIAL_SESSION_STATE,
      records: [
        requestRecord({ turnId: TURN_ID }),
        speechRecord({ text: "一言目" }),
        speechRecord({ text: "二言目" }),
      ],
    })
    const { container } = render(
      <Turn
        turn={turn([
          step({
            id: 0,
            mark: "interim-folded",
            body: {
              kind: "text",
              report: { kind: "markdown", markdown: "架空のまとめ" },
              firstLine: "1/2 架空の段",
              task: { kind: "none" },
              finishedPhase: {
                kind: "phase",
                label: "1/2 架空の段",
                duration: { kind: "known", milliseconds: 0 },
                skipped: false,
              },
              changeSummary: { kind: "none" },
            },
          }),
        ])}
        newest
        freshReport={false}
      />,
    )

    const groups = [...container.querySelectorAll("[data-stream-group]")]
    expect(groups.map((group) => group.getAttribute("data-stream-group"))).toEqual([
      "user",
      "other",
      "other",
    ])
    expect(groups.map((group) => group.querySelectorAll("details").length)).toEqual([0, 0, 1])
    expect(groups[2]?.textContent).toContain("二言目")
    expect(groups[2]?.textContent).toContain("1/2 架空の段")
    expect(groups[2]?.textContent).toContain("所要 0秒")
  })
})

describe("Turn（経過の畳み）", () => {
  const interims = [0, 1, 2].map((id) =>
    step({ id, body: turnBodyText(`中間${String(id)}`), mark: "interim-folded" }),
  )

  it("閉じたやり取りでは、最終レポートの上に作業の経過の畳みが1つだけ出て、中は届いた順の1行の畳み", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container } = render(
      <Turn
        turn={turn([...interims, step({ id: 3, body: turnBodyText("最終"), mark: "final" })])}
        newest
        freshReport={false}
      />,
    )

    const folds = container.querySelectorAll(".progress-fold")
    expect(folds).toHaveLength(1)
    const fold = typedElement(folds[0], HTMLDetailsElement, "経過の畳み")
    expect(fold.open).toBe(false)
    expect(fold.querySelector(":scope > summary")?.textContent).toBe("作業の経過 3 件")
    expect(
      [...fold.querySelectorAll("details.is-interim > summary")].map(
        (summary) => summary.textContent,
      ),
    ).toEqual(["中間0", "中間1", "中間2"])

    expect(
      [...container.querySelectorAll("[data-report-stub]")].map((stub) => stub.textContent),
    ).toEqual(["最終"])

    for (const details of fold.querySelectorAll("details.is-interim")) {
      toggleDetails(details, true)
    }
    const stubs = [...container.querySelectorAll("[data-report-stub]")]
    expect(stubs.map((stub) => stub.textContent)).toEqual(["中間0", "中間1", "中間2", "最終"])
    expect(stubs.slice(0, 3).every((stub) => fold.contains(stub))).toBe(true)
  })

  it("畳んだ中間レポートは開いたときに描かれ、閉じ直しても DOM に残る", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container } = render(
      <Turn
        turn={turn([...interims, step({ id: 3, body: turnBodyText("最終"), mark: "final" })])}
        newest
        freshReport={false}
      />,
    )
    const first = container.querySelector("details.is-interim")
    expect(first?.querySelector("[data-report-stub]")).toBeNull()

    toggleDetails(first ?? container, true)
    expect(first?.querySelector("[data-report-stub]")?.textContent).toBe("中間0")

    toggleDetails(first ?? container, false)
    expect(first?.querySelector("[data-report-stub]")?.textContent).toBe("中間0")
  })

  it("完了後のセリフは最上位に出ず、畳みを開くと届いた順で入っていて、締めのセリフだけが最上位に残る", () => {
    putSession({
      ...INITIAL_SESSION_STATE,
      records: [
        requestRecord({ turnId: TURN_ID }),
        speechRecord({ text: "作業中の一言目" }),
        speechRecord({ text: "作業中の二言目" }),
        reportRecord("最終"),
        speechRecord({ text: "締めの一言" }),
      ],
    })
    const { container } = render(
      <Turn
        turn={turn([
          step({
            id: 3,
            body: turnBodyText("最終"),
            origin: { kind: "tool-report", toolUseId: "fictional-report" },
            mark: "final",
          }),
        ])}
        newest
        freshReport={false}
      />,
    )

    const fold = typedElement(container.querySelector(".progress-fold"), HTMLDetailsElement, "畳み")
    expect(fold.querySelector(":scope > summary")?.textContent).toBe(
      "作業の経過 0 件 · セリフ 2 件",
    )
    expect(fold.textContent).toContain("作業中の一言目")
    expect(fold.textContent.indexOf("作業中の一言目")).toBeLessThan(
      fold.textContent.indexOf("作業中の二言目"),
    )
    const groups = [...container.querySelectorAll("[data-stream-group]")]
    expect(
      groups
        .filter((group) => group.textContent.includes("作業中の"))
        .map((group) => group.firstElementChild),
    ).toEqual([fold])
    const closingGroup = groups.find((group) => group.textContent.includes("締めの一言"))
    expect(closingGroup).not.toBe(groups.find((group) => group.contains(fold)))
    expect(closingGroup?.textContent.indexOf("締めの一言")).toBeLessThan(
      closingGroup?.textContent.indexOf("最終") ?? -1,
    )
    expect(closingGroup?.querySelector("[data-report-stub]")?.textContent).toBe("最終")
    expect(fold.compareDocumentPosition(closingGroup ?? fold)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it("経過の畳みの中は狭い画面でも隠さず、働くあいだの畳んだ中間レポートは隠したまま", () => {
    putSession(INITIAL_SESSION_STATE)
    const closed = render(
      <Turn
        turn={turn([...interims, step({ id: 3, body: turnBodyText("最終"), mark: "final" })])}
        newest
        freshReport={false}
      />,
    )
    const fold = closed.container.querySelector(".progress-fold")
    expect(fold?.classList.contains("hidden-on-narrow")).toBe(false)
    expect(fold?.querySelectorAll(".hidden-on-narrow")).toHaveLength(0)
    closed.unmount()

    const working = render(
      <Turn
        turn={turn([...interims, step({ id: 3, body: turnBodyText("まだ決まらない本文") })])}
        newest
        freshReport={false}
      />,
    )
    expect(working.container.querySelectorAll("details.is-interim.hidden-on-narrow")).toHaveLength(
      3,
    )
  })

  function askedStep(id: number, questionText: string): MainViewQuestion {
    return {
      kind: "question",
      toolUseId: `ask-${String(id)}`,
      questions: [
        {
          header: `見出し${String(id)}`,
          text: questionText,
          multiSelect: false,
          options: [{ label: "選んだ答え", description: "", preview: undefined }],
        },
      ],
      answers: [{ kind: "chosen", labels: ["選んだ答え"] }],
      briefs: [],
      imageSizes: [],
      unshelvedImages: [],
    }
  }

  it("質問の記録は最終の札にも外にも出ず、経過の畳みの中に届いた順で入り、summary に数が付く", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container } = render(
      <Turn
        turn={turn([
          step({
            id: 0,
            body: turnBodyText("中間"),
            mark: "interim-folded",
            actions: [askedStep(0, "中間の質問")],
          }),
          step({
            id: 1,
            body: turnBodyText("最終"),
            mark: "final",
            actions: [askedStep(1, "最終の質問")],
          }),
        ])}
        newest
        freshReport={false}
      />,
    )

    const fold = typedElement(container.querySelector(".progress-fold"), HTMLDetailsElement, "畳み")
    expect(fold.querySelector(":scope > summary")?.textContent).toBe("作業の経過 1 件 · 質問 1 件")
    const inside = fold.textContent
    expect(inside.indexOf("中間")).toBeGreaterThanOrEqual(0)
    expect(inside.indexOf("中間")).toBeLessThan(inside.indexOf("中間の質問"))
    // 最終レポートより後ろに届いた質問は、流れの位置のまま畳みの外に残る。
    expect(inside).not.toContain("最終の質問")
    expect(container.textContent).toContain("最終の質問")
  })

  it("働くあいだは、質問の記録を今までどおり札のそばに出す", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container } = render(
      <Turn
        turn={turn([
          step({ id: 0, body: turnBodyText("本文"), actions: [askedStep(0, "進行中の質問")] }),
        ])}
        newest
        freshReport={false}
      />,
    )

    expect(container.querySelector(".progress-fold")).toBeNull()
    expect(container.textContent).toContain("進行中の質問")
  })

  it("中間レポートが無い閉じたやり取りには、経過の畳みを出さない", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container } = render(
      <Turn
        turn={turn([step({ id: 0, body: turnBodyText("最終"), mark: "final" })])}
        newest
        freshReport={false}
      />,
    )

    expect(container.querySelector(".progress-fold")).toBeNull()
  })

  it("働くあいだは経過の畳みを出さず、中間レポートを届いた順に並べたまま", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container } = render(
      <Turn
        turn={turn([...interims, step({ id: 3, body: turnBodyText("まだ決まらない本文") })])}
        newest
        freshReport={false}
      />,
    )

    expect(container.querySelector(".progress-fold")).toBeNull()
    for (const details of container.querySelectorAll("details.is-interim")) {
      toggleDetails(details, true)
    }
    expect(
      [...container.querySelectorAll("[data-report-stub]")].map((stub) => stub.textContent),
    ).toEqual(["中間0", "中間1", "中間2", "まだ決まらない本文"])
  })
})
