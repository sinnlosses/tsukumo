import { act, cleanup, fireEvent, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { BackgroundTask } from "../../../../src/shared/session-driver/background-task.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../../src/shared/session/session-fold.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../src/shared/session/session-state.ts"
import { renderScreenNav, workToggle } from "../../../fixture/current-work.tsx"
import { requestEvent } from "../../../fixture/session-event.ts"
import {
  finishedToolStatus,
  requestRecord,
  toolRecord,
  workPlanRecord,
} from "../../../fixture/session-record.ts"
import { typedElement } from "../../../typed-element.ts"
import { putState } from "../../session-store.ts"

afterEach(() => {
  cleanup()
  window.location.hash = ""
})

/** 依頼の手順の一覧（開いているのは1つだけ）。 */
function workList(): HTMLElement {
  return typedElement(
    document.querySelectorAll(".current-work-list")[0],
    HTMLElement,
    "依頼の手順の一覧",
  )
}

function listLines(selector: string): (string | null)[] {
  return [...workList().querySelectorAll(selector)].map((node) => node.textContent)
}

describe("いまの作業（帯の札と、押すと開く依頼の手順の一覧）。語・要約・段の出し分けは hooks/use-current-work.test.ts", () => {
  it("依頼が一度も無ければ、開くと「まだ依頼が無い」と出る", () => {
    renderScreenNav()

    fireEvent.click(workToggle())

    expect(within(workList()).getByText("まだ依頼が無い")).not.toBeNull()
  })

  describe("バックグラウンドタスク", () => {
    const SHELL_TASK = {
      taskId: "bash-1",
      kind: "shell",
      description: "架空の待ち",
    } satisfies BackgroundTask
    const AGENT_TASK = {
      taskId: "agent-1",
      kind: "agent",
      description: "",
    } satisfies BackgroundTask
    const FINISHED_TURN = {
      kind: "finished",
      startedAt: 0,
      finishedAt: 1,
      ending: { kind: "ended" },
    } satisfies SessionState["turn"]

    it("開くと「背景で動いているもの」に種類と説明が並び、終わると札の要約と一覧から消える", () => {
      renderScreenNav({
        turn: FINISHED_TURN,
        records: [requestRecord()],
        backgroundTasks: [SHELL_TASK, AGENT_TASK],
      })

      fireEvent.click(workToggle())

      expect(document.querySelector(".current-work-background-heading")?.textContent).toBe(
        "背景で動いているもの（2 件）",
      )
      expect(
        [...document.querySelectorAll(".current-work-background li")].map((row) => row.textContent),
      ).toEqual(["… シェル 架空の待ち", "… サブエージェント"])

      act(() => {
        putState({
          ...INITIAL_SESSION_STATE,
          turn: FINISHED_TURN,
          records: [requestRecord()],
          backgroundTasks: [],
        })
      })

      expect(document.querySelector(".current-work-summary")).toBeNull()
      expect(document.querySelector(".current-work-background-heading")).toBeNull()
    })

    it("ターンが走っている間も、一覧にはバックグラウンドタスクが出る", () => {
      renderScreenNav({
        turn: { kind: "running", startedAt: 0 },
        records: [requestRecord()],
        backgroundTasks: [SHELL_TASK],
      })

      fireEvent.click(workToggle())

      expect(document.querySelector(".current-work-background-heading")).not.toBeNull()
    })
  })

  it("押すと一覧が開き、実行中の手順の全文（切り詰めない）が出る", () => {
    const longCommand = `echo ${"a".repeat(200)}`
    renderScreenNav({
      turn: { kind: "running", startedAt: 0 },
      records: [
        requestRecord(),
        toolRecord({ toolUseId: "toolu_1", name: "Bash", input: { command: longCommand } }),
      ],
    })

    fireEvent.click(workToggle())

    expect(document.querySelector(".current-work-full-heading")?.textContent).toBe("実行中の Bash")
    expect(document.querySelector(".current-work-full-text")?.textContent).toBe(longCommand)
  })

  it("一覧に済み・実行中が新しい→古いの順で並び、済んだ手順には所要時間が付く", () => {
    renderScreenNav({
      turn: { kind: "running", startedAt: 0 },
      records: [
        requestRecord(),
        toolRecord({
          toolUseId: "toolu_old",
          name: "Read",
          input: { file_path: "/tmp/old.txt" },
          startedAt: { kind: "stamped", at: 0 },
          status: finishedToolStatus({
            result: { kind: "succeeded" },
            finishedAt: { kind: "stamped", at: 12_000 },
          }),
        }),
        toolRecord({ toolUseId: "toolu_new", name: "Bash", input: { command: "echo new" } }),
      ],
    })

    fireEvent.click(workToggle())

    expect(listLines(".current-work-steps li")).toEqual([
      "… Bash: echo new",
      "✓ Read: /tmp/old.txt（12秒）",
    ])
  })

  describe("ワークプラン（work_plan）", () => {
    const PHASES = ["架空の段A", "架空の段B", "架空の段C"]
    const PLANNED_RECORDS = [
      requestRecord(),
      workPlanRecord({ phases: PHASES, current: 0 }),
      toolRecord({
        toolUseId: "toolu_a",
        name: "Read",
        input: { file_path: "/tmp/a.txt" },
        status: finishedToolStatus(),
      }),
      workPlanRecord({ phases: PHASES, current: 1 }),
      toolRecord({ toolUseId: "toolu_b", name: "Bash", input: { command: "echo b" } }),
    ]

    it("飛ばした段は「/」と取り消し線の class を持ち、済んだ段は「✓」のまま", () => {
      renderScreenNav({
        turn: { kind: "running", startedAt: 0 },
        records: [
          requestRecord(),
          workPlanRecord({
            phases: PHASES,
            current: 2,
            phaseSummary: "架空のまとめ。",
            skippedPhases: ["架空の段A"],
          }),
        ],
      })

      fireEvent.click(workToggle())

      const phases = [...workList().querySelectorAll(".current-work-plan li")]
      expect(phases.map((phase) => phase.textContent)).toEqual([
        "/架空の段A",
        "✓架空の段B",
        "3架空の段C",
      ])
      expect(
        phases.map((phase) => phase.className.includes("current-work-plan-phase-skipped")),
      ).toEqual([true, false, false])
    })

    it("一覧の頭に全部の段が ✓・番号で並び、手順は始まったときの段ごとに区切られる", () => {
      renderScreenNav({ turn: { kind: "running", startedAt: 0 }, records: PLANNED_RECORDS })

      fireEvent.click(workToggle())

      expect(within(workList()).getByText("この依頼のワークプラン")).not.toBeNull()
      expect(listLines(".current-work-plan li")).toEqual(["✓架空の段A", "2架空の段B", "3架空の段C"])
      expect(workList().querySelector(".current-work-plan-span-name")).toBeNull()
      expect(listLines(".current-work-phase-heading, .current-work-steps li")).toEqual([
        "2/3 架空の段B",
        "… Bash: echo b",
        "1/3 架空の段A",
        "✓ Read: /tmp/a.txt（0秒）",
      ])
    })

    it("委譲先の段の範囲があれば、前・本・後の群ごとの行に群の中の番号で並ぶ", () => {
      renderScreenNav({
        turn: { kind: "running", startedAt: 0 },
        records: [
          requestRecord(),
          workPlanRecord({
            phases: ["架空の計画", "架空の段A", "架空の段B", "架空の受け入れ"],
            current: 1,
            delegatedRange: { kind: "range", first: 1, count: 2 },
          }),
        ],
      })

      fireEvent.click(workToggle())

      expect(
        [...workList().querySelectorAll(".current-work-plan-span")].map((span) => [
          span.querySelector(".current-work-plan-span-name")?.textContent,
          [...span.querySelectorAll("li")].map((phase) => phase.textContent),
        ]),
      ).toEqual([
        ["前", ["✓架空の計画"]],
        ["本", ["1架空の段A", "2架空の段B"]],
        ["後", ["1架空の受け入れ"]],
      ])
      expect(workList().querySelector(".current-work-plan-span-current")?.textContent).toBe("本")
    })

    it("同じ段の手順は隣どうしで1まとまりになり、段が戻れば別のまとまりになる", () => {
      const bash = (id: string) =>
        toolRecord({ toolUseId: id, name: "Bash", input: { command: `echo ${id}` } })
      const phases = ["架空の段A", "架空の段B"]
      renderScreenNav({
        turn: { kind: "running", startedAt: 0 },
        records: [
          requestRecord(),
          bash("t0"),
          workPlanRecord({ phases, current: 0 }),
          bash("t1"),
          bash("t2"),
          workPlanRecord({ phases, current: 1, phaseSummary: "まとめ" }),
          bash("t3"),
          workPlanRecord({ phases, current: 0 }),
          bash("t4"),
        ],
      })

      fireEvent.click(workToggle())

      expect(listLines(".current-work-phase-heading, .current-work-steps li")).toEqual([
        "1/2 架空の段A",
        "… Bash: echo t4",
        "2/2 架空の段B",
        "… Bash: echo t3",
        "1/2 架空の段A",
        "… Bash: echo t2",
        "… Bash: echo t1",
        "… Bash: echo t0",
      ])
    })

    it("ターンが終わると、一覧には前の依頼のワークプランが残る", () => {
      renderScreenNav({
        turn: { kind: "finished", startedAt: 0, finishedAt: 1, ending: { kind: "ended" } },
        records: [...PLANNED_RECORDS, workPlanRecord({ phases: PHASES, current: 3 })],
      })

      fireEvent.click(workToggle())

      expect(within(workList()).getByText("前の依頼のワークプラン")).not.toBeNull()
    })
  })

  it("復元した手順（開始・終了が restored）は所要時間を出さない", () => {
    renderScreenNav({
      turn: { kind: "running", startedAt: 0 },
      records: [
        requestRecord(),
        toolRecord({
          toolUseId: "toolu_restored",
          name: "Read",
          input: { file_path: "/tmp/restored.txt" },
          startedAt: { kind: "restored" },
          status: finishedToolStatus({
            result: { kind: "succeeded" },
            finishedAt: { kind: "restored" },
          }),
        }),
      ],
    })

    fireEvent.click(workToggle())

    expect(document.querySelector(".current-work-steps li")?.textContent).toBe(
      "✓ Read: /tmp/restored.txt",
    )
  })

  it("6件以上あると「手順をすべて見る」の口が出て、押すと全件に広がり、先頭は最新のまま", () => {
    const records = [
      requestRecord(),
      ...Array.from({ length: 12 }, (_unused, index) =>
        toolRecord({
          toolUseId: `toolu_${String(index)}`,
          name: "Bash",
          input: { command: `echo ${String(index)}` },
        }),
      ),
    ]
    renderScreenNav({ turn: { kind: "running", startedAt: 0 }, records })

    fireEvent.click(workToggle())

    const rowTexts = () => listLines(".current-work-steps li")
    expect(rowTexts()).toHaveLength(5)
    expect(rowTexts()[0]).toBe("… Bash: echo 11")

    fireEvent.click(screen.getByRole("button", { name: "手順をすべて見る（全 12 件）" }))

    expect(rowTexts()).toHaveLength(12)
    expect(rowTexts()[0]).toBe("… Bash: echo 11")
    expect(rowTexts().at(-1)).toBe("… Bash: echo 0")
    expect(screen.getByRole("button", { name: "新しい5件だけにする" })).toBeDefined()
  })

  it("5件の外に失敗があれば「すべて見る」の口に失敗の数を添える", () => {
    const records = [
      requestRecord(),
      toolRecord({
        toolUseId: "toolu_failed",
        name: "Bash",
        input: { command: "架空のコマンド" },
        status: finishedToolStatus({
          result: { kind: "failed", output: { head: "架空のエラー出力", omittedLength: 0 } },
        }),
      }),
      ...Array.from({ length: 5 }, (_unused, index) =>
        toolRecord({
          toolUseId: `toolu_${String(index)}`,
          name: "Read",
          input: { file_path: `/tmp/${String(index)}.txt` },
          status: finishedToolStatus({ result: { kind: "succeeded" } }),
        }),
      ),
    ]
    renderScreenNav({ records })

    fireEvent.click(workToggle())

    expect(
      screen.getByRole("button", { name: "手順をすべて見る（全 6 件・失敗 1）" }),
    ).toBeDefined()
  })

  it("失敗した手順は開くと出力・引数の順に読める（レポートには出さないため）", () => {
    renderScreenNav({
      records: [
        requestRecord(),
        toolRecord({
          toolUseId: "toolu_1",
          name: "Bash",
          input: { command: "架空のコマンド" },
          status: finishedToolStatus({
            result: { kind: "failed", output: { head: "架空のエラー出力", omittedLength: 0 } },
          }),
        }),
      ],
    })

    fireEvent.click(workToggle())

    expect(screen.getByText("失敗")).toBeDefined()
    expect(document.querySelector(".current-work-failure-output")?.textContent).toContain(
      "架空のエラー出力",
    )
    expect(document.querySelector(".current-work-failure-input")?.textContent).toContain(
      "架空のコマンド",
    )
  })

  it("上限を超える失敗の出力は、先頭 8000 字と落とした字数で出る", () => {
    const events: readonly SessionEvent[] = [
      requestEvent(),
      {
        kind: "tool-started",
        toolUseId: "toolu_1",
        name: "Bash",
        input: { command: "架空のコマンド" },
        parentToolUseId: undefined,
      },
      {
        kind: "tool-finished",
        toolUseId: "toolu_1",
        content: "架".repeat(8005),
        isError: true,
      },
    ]
    const state = events.reduce(
      (current, event) => applySessionEvent(current, event, 0),
      INITIAL_SESSION_STATE,
    )
    renderScreenNav({ records: state.records })

    fireEvent.click(workToggle())

    expect(document.querySelector(".current-work-failure-output")?.textContent).toBe(
      `${"架".repeat(8000)}\n…（以下 5 文字を省略）`,
    )
  })

  it("結果が届いていない手順は、ターンが終わっていても実行中のまま出す", () => {
    renderScreenNav({
      turn: { kind: "finished", startedAt: 0, finishedAt: 100, ending: { kind: "ended" } },
      records: [
        requestRecord(),
        toolRecord({ toolUseId: "toolu_1", name: "Bash", input: { command: "echo" } }),
      ],
    })

    fireEvent.click(workToggle())

    expect(document.querySelector(".current-work-steps li")?.textContent).toBe("… Bash: echo")
  })

  it("セッションが終わると、実行中だった手順は一覧から消える", () => {
    renderScreenNav({
      endedReason: "セッションが終了した",
      records: [
        requestRecord(),
        toolRecord({ toolUseId: "toolu_1", name: "Bash", input: { command: "echo" } }),
      ],
    })

    fireEvent.click(workToggle())

    expect(within(workList()).getByText("この依頼ではまだツールを使っていない")).not.toBeNull()
  })
})
