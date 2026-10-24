import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useComposerDraft } from "../../../../../../../../../src/browser/stores/composer-draft.ts"
import { useTaskBoardRequest } from "../../../../../../../../../src/browser/stores/task-board-request.ts"
import type { ReportChangeSummary } from "../../../../../../../../../src/shared/report/report-change-summary.ts"
import type {
  MainViewQuestion,
  MainViewReportBody,
  MainViewStep,
  MainViewStepBody,
} from "../../../../../../../../../src/shared/session/main-view-shape.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../../../src/shared/session/session-state.ts"
import { bodyMarkdownOf } from "../../../../../../../../fixture/main-view-entry.ts"
import { step, turn, turnBodyText } from "../../../../../../../../fixture/turn.ts"
import { typedElement } from "../../../../../../../../typed-element.ts"
import { putSession } from "../../../../../../../session-store.ts"

// 本物の `Report`（react-markdown 一式と演出の配線を持つ）ではなく、本文だけを描く代役に差し替える。
vi.mock(
  "../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/report/report.tsx",
  () => ({
    Report: (props: { readonly body: MainViewReportBody }) => (
      <div data-report-stub="yes">{bodyMarkdownOf(props.body)}</div>
    ),
  }),
)

const { Turn } =
  await import("../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/turn/turn.tsx")

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

describe("Turn（失敗で終わったやり取り）", () => {
  it("本文が1つも無いまま失敗したやり取りでも、失敗の塊は出す", () => {
    putSession(INITIAL_SESSION_STATE)
    render(
      <Turn
        turn={{ ...turn([]), failure: { kind: "failed", failure: { kind: "max-turns" } } }}
        newest={false}
        freshReport={false}
      />,
    )

    expect(screen.getByRole("note", { name: "失敗で終わった" }).textContent).toContain(
      "往復の上限に当たった",
    )
  })

  it("利用上限で終わったやり取りの戻る時刻つきの口を押すと、依頼が入力欄の下書きに入る", () => {
    putSession({
      ...INITIAL_SESSION_STATE,
      rateLimit: {
        kind: "rejected",
        bucket: "five-hour",
        resetsAt: Temporal.Now.instant().add({ hours: 1 }).epochMilliseconds,
      },
    })
    render(
      <Turn
        turn={{
          ...turn([]),
          failure: { kind: "failed", failure: { kind: "api-error", error: "rate_limit" } },
        }}
        newest
        freshReport={false}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /に戻る · 依頼を入力欄に戻す$/ }))

    expect(useComposerDraft.getState().draft.text).toBe("架空の依頼")
  })
})

describe("Turn（目録の1行と見出し）", () => {
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
        turn={turn([step({ id: 0, body: taskBody("架空の本文"), final: true })])}
        newest
        freshReport={false}
      />,
    )

    expect(screen.queryByRole("button", { name: "X-7" })).toBeNull()
  })

  it("変更の札が数を持てば、目録の末尾に「変更 n ファイル +a −b」が出る", () => {
    putSession(INITIAL_SESSION_STATE)
    const body = taskBody("架空の本文", {
      kind: "counted",
      files: 3,
      added: 12,
      removed: 4,
      mixed: false,
    })
    const { container } = render(
      <Turn turn={turn([step({ id: 0, body, final: true })])} newest freshReport={false} />,
    )

    expect(container.querySelector("header > p")?.textContent).toBe(
      "最終レポート·X-7·✓ 完了·変更 3 ファイル +12 −4",
    )
  })

  it("変更の札が mixed なら、数の後ろに「※他の変更を含みうる」の注記が出る", () => {
    putSession(INITIAL_SESSION_STATE)
    const body = taskBody("架空の本文", {
      kind: "counted",
      files: 3,
      added: 12,
      removed: 4,
      mixed: true,
    })
    const { container } = render(
      <Turn turn={turn([step({ id: 0, body, final: true })])} newest freshReport={false} />,
    )

    expect(container.querySelector("header > p")?.textContent).toBe(
      "最終レポート·X-7·✓ 完了·変更 3 ファイル +12 −4 ※他の変更を含みうる",
    )
  })

  it("変更の札が none なら、目録に「変更」の字は出ない", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container } = render(
      <Turn
        turn={turn([step({ id: 0, body: taskBody("架空の本文"), final: true })])}
        newest
        freshReport={false}
      />,
    )

    expect(container.querySelector("header > p")?.textContent).not.toContain("変更")
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
            body: "",
            location: { kind: "none" },
          },
        ],
      },
    })
    render(
      <Turn
        turn={turn([step({ id: 0, body: taskBody("架空の本文"), final: true })])}
        newest
        freshReport={false}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "X-7" }))

    expect(useTaskBoardRequest.getState().request).toEqual({
      kind: "open",
      focus: { kind: "task", id: "X-7" },
    })
  })

  it.each([
    ["finished", "X-7·✓ 完了"],
    ["awaiting-answer", "X-7·？ 答え待ち"],
    ["stopped", "X-7"],
  ] as const)("終わり方 %s の目録の1行は「%s」で、見出しは作業の名前", (outcome, catalog) => {
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

    expect(container.querySelector("header > p")?.textContent).toBe(catalog)
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("架空の作業 a/b を直す")
  })
})

describe("Turn（畳んだ中間レポートの見出し）", () => {
  function phaseStep(id: number, skipped: boolean): MainViewStep {
    return step({
      id,
      interim: true,
      superseded: true,
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
        turn={turn([phaseStep(0, false), phaseStep(1, true), step({ id: 2, final: true })])}
        newest
        freshReport={false}
      />,
    )

    expect(
      [...container.querySelectorAll("details.is-interim > summary")].map(
        (node) => node.textContent,
      ),
    ).toEqual([
      "中間レポート: 1/2 架空の段 · 所要 0秒",
      "中間レポート: 2/2 架空の段 · 飛ばした · 所要 0秒",
    ])
  })
})

describe("Turn（脇の話の欄の位置）", () => {
  it("働くあいだ（最終レポートが無い）は、脇の話の欄が持ち主のステップの後ろ・次のレポートの前に並ぶ", () => {
    putSession(INITIAL_SESSION_STATE)
    const aside = { text: "架空の問い", answer: { kind: "waiting" } } as const
    const { container } = render(
      <Turn
        turn={turn([
          step({ id: 0, body: turnBodyText("1つ目の本文"), interim: true, asides: [aside] }),
          step({ id: 1, body: turnBodyText("2つ目の本文"), interim: true }),
        ])}
        newest
        freshReport={false}
      />,
    )

    const order = [...container.querySelectorAll("[data-report-stub], details")].map(
      (element) => element.textContent,
    )
    expect(order).toHaveLength(3)
    expect(order[0]).toBe("1つ目の本文")
    expect(order[1]).toContain("脇の話 1件")
    expect(order[2]).toBe("2つ目の本文")
  })

  it("最終レポートのある閉じたやり取りは、最終レポート → 脇の話の欄 → 経過の畳みの順に並ぶ", () => {
    putSession(INITIAL_SESSION_STATE)
    const aside = { text: "架空の問い", answer: { kind: "waiting" } } as const
    const { container } = render(
      <Turn
        turn={turn([
          step({
            id: 0,
            body: turnBodyText("中間の本文"),
            interim: true,
            superseded: true,
            asides: [aside],
          }),
          step({ id: 1, body: turnBodyText("最終の本文"), final: true }),
        ])}
        newest
        freshReport={false}
      />,
    )

    const top = [...container.querySelectorAll(":scope > div > div > *")].map(
      (element) => element.textContent,
    )
    expect(top).toHaveLength(3)
    expect(top[0]).toBe("最終の本文")
    expect(top[1]).toContain("脇の話 1件")
    expect(top[2]).toContain("経過 1 件")
    expect(top[2]).toContain("中間の本文")
  })

  it("本文も質問も無いステップの脇の話は、欄だけを描く", () => {
    putSession(INITIAL_SESSION_STATE)
    const aside = { text: "架空の問い", answer: { kind: "waiting" } } as const
    const { container } = render(
      <Turn turn={turn([step({ id: 0, asides: [aside] })])} newest freshReport={false} />,
    )

    expect(container.querySelectorAll("section")).toHaveLength(0)
    expect(container.querySelectorAll("details")).toHaveLength(1)
  })
})

describe("Turn（経過の畳み）", () => {
  const interims = [0, 1, 2].map((id) =>
    step({ id, body: turnBodyText(`中間${String(id)}`), interim: true, superseded: true }),
  )

  it("閉じたやり取りでは、最終レポートの下に経過の畳みが1つだけ出て、中は届いた順の1行の畳み", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container } = render(
      <Turn
        turn={turn([...interims, step({ id: 3, body: turnBodyText("最終"), final: true })])}
        newest
        freshReport={false}
      />,
    )

    const folds = container.querySelectorAll(".progress-fold")
    expect(folds).toHaveLength(1)
    const fold = typedElement(folds[0], HTMLDetailsElement, "経過の畳み")
    expect(fold.open).toBe(false)
    expect(fold.querySelector(":scope > summary")?.textContent).toBe("経過 3 件")
    expect(
      [...fold.querySelectorAll("details.is-interim > summary")].map(
        (summary) => summary.textContent,
      ),
    ).toEqual(["中間レポート: 中間0", "中間レポート: 中間1", "中間レポート: 中間2"])

    expect(
      [...container.querySelectorAll("[data-report-stub]")].map((stub) => stub.textContent),
    ).toEqual(["最終"])

    for (const details of fold.querySelectorAll("details.is-interim")) {
      toggleDetails(details, true)
    }
    const stubs = [...container.querySelectorAll("[data-report-stub]")]
    expect(stubs.map((stub) => stub.textContent)).toEqual(["最終", "中間0", "中間1", "中間2"])
    expect(stubs.slice(1).every((stub) => fold.contains(stub))).toBe(true)
  })

  it("畳んだ中間レポートは開いたときに描かれ、閉じ直しても DOM に残る", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container } = render(
      <Turn
        turn={turn([...interims, step({ id: 3, body: turnBodyText("最終"), final: true })])}
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

  it("経過の畳みの中は狭い画面でも隠さず、働くあいだの畳んだ中間レポートは隠したまま", () => {
    putSession(INITIAL_SESSION_STATE)
    const closed = render(
      <Turn
        turn={turn([...interims, step({ id: 3, body: turnBodyText("最終"), final: true })])}
        newest
        freshReport={false}
      />,
    )
    const fold = closed.container.querySelector(".progress-fold")
    expect(fold?.classList.contains("phone-hidden")).toBe(false)
    expect(fold?.querySelectorAll(".phone-hidden")).toHaveLength(0)
    closed.unmount()

    const working = render(
      <Turn
        turn={turn([...interims, step({ id: 3, body: turnBodyText("まだ決まらない本文") })])}
        newest
        freshReport={false}
      />,
    )
    expect(working.container.querySelectorAll("details.is-interim.phone-hidden")).toHaveLength(3)
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
      answers: [["選んだ答え"]],
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
            interim: true,
            superseded: true,
            actions: [askedStep(0, "中間の質問")],
          }),
          step({
            id: 1,
            body: turnBodyText("最終"),
            final: true,
            actions: [askedStep(1, "最終の質問")],
          }),
        ])}
        newest
        freshReport={false}
      />,
    )

    const fold = typedElement(container.querySelector(".progress-fold"), HTMLDetailsElement, "畳み")
    expect(fold.querySelector(":scope > summary")?.textContent).toBe("経過 1 件 · 質問 2 件")
    const inside = fold.textContent
    expect(inside.indexOf("中間レポート")).toBeLessThan(inside.indexOf("中間の質問"))
    expect(inside.indexOf("中間の質問")).toBeLessThan(inside.indexOf("最終の質問"))

    const outside = [...container.querySelectorAll(":scope > div > div > *")]
      .filter((element) => element !== fold)
      .map((element) => element.textContent)
    expect(outside).toEqual(["最終"])
  })

  it("中間レポートが無く質問だけでも経過の畳みが出る", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container } = render(
      <Turn
        turn={turn([
          step({
            id: 0,
            body: turnBodyText("最終"),
            final: true,
            actions: [askedStep(0, "ただ1つの質問")],
          }),
        ])}
        newest
        freshReport={false}
      />,
    )

    const fold = container.querySelector(".progress-fold")
    expect(fold?.querySelector(":scope > summary")?.textContent).toBe("経過 0 件 · 質問 1 件")
    expect(fold?.textContent).toContain("ただ1つの質問")
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
        turn={turn([step({ id: 0, body: turnBodyText("最終"), final: true })])}
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
