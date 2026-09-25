import { afterEach, describe, expect, it } from "bun:test"

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import { ScreenNav } from "../../../../../src/browser/components/domain/screen-nav/screen-nav.tsx"
import { parseHash } from "../../../../../src/browser/stores/location-hash.ts"
import {
  QuestionScrollContext,
  type QuestionScrollValue,
} from "../../../../../src/browser/stores/question-scroll.tsx"
import {
  type SessionStore,
  SessionStoreContext,
} from "../../../../../src/browser/stores/session.tsx"
import {
  TurnSelectionContext,
  type TurnSelectionValue,
} from "../../../../../src/browser/stores/turn-selection.tsx"
import { type BackgroundTask } from "../../../../../src/shared/background-task.ts"
import { type PendingAsk } from "../../../../../src/shared/pending-ask.ts"
import { type Question } from "../../../../../src/shared/question.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session-state.ts"
import { characterInfo } from "../../../../fixture/character.ts"
import { requestRecord, toolRecord } from "../../../../fixture/session-record.ts"
import { typedElement } from "../../../../typed-element.ts"
import { putState, sessionStoreWith } from "../../../session-store.ts"

// フィクスチャはすべて手で書いた架空の依頼・ツール呼び出し・質問（docs/coding-standards.md
// 「会話内容の扱い」）。

afterEach(() => {
  cleanup()
  // 「質問へ」は会話の画面（`#`）へ hash を書き換える（`stores/screen.tsx`）ので、次のテストへ
  // 持ち越さない。
  window.location.hash = ""
})

const FIXTURE_PENDING: PendingAsk = {
  kind: "permission",
  id: "ask-1",
  toolName: "Read",
  input: {},
}

function fixtureQuestion(header: string): Question {
  return { header, text: "架空の質問", multiSelect: false, options: [] }
}

function questionPending(headers: readonly string[]): PendingAsk {
  return { kind: "question", id: "ask-1", questions: headers.map(fixtureQuestion) }
}

function renderScreenNav(
  state: Partial<SessionState> = {},
  options: {
    readonly selection?: Partial<TurnSelectionValue>
    readonly scroll?: Partial<QuestionScrollValue>
  } = {},
): SessionStore {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, ...state })
  const selection: TurnSelectionValue = {
    activeTurnId: 1,
    newestTurnId: 1,
    selectTurn: () => {},
    ...options.selection,
  }
  const scroll: QuestionScrollValue = { signal: 0, requestScroll: () => {}, ...options.scroll }
  render(
    <SessionStoreContext.Provider value={store}>
      <TurnSelectionContext.Provider value={selection}>
        <QuestionScrollContext.Provider value={scroll}>
          <ScreenNav />
        </QuestionScrollContext.Provider>
      </TurnSelectionContext.Provider>
    </SessionStoreContext.Provider>,
  )
  return store
}

/** 帯（広い画面）にある「いまの作業」の札。 */
function workToggle(): HTMLElement {
  return typedElement(
    document.querySelector(".screen-nav > .screen-nav-work .screen-nav-work-toggle"),
    HTMLElement,
    "帯のいまの作業の札",
  )
}

/** 狭い画面の「≡」の面の中にある同じ札（開いていないと無い）。 */
function panelWorkToggle(): HTMLElement {
  return typedElement(
    document.querySelector(".screen-nav-panel .screen-nav-work-toggle"),
    HTMLElement,
    "面の中のいまの作業の札",
  )
}

/** 帯（広い画面）の依頼の手順の一覧。**広い画面・狭い画面の両方に同じ内容が2つ描かれる**ので、
 * 先頭（帯側）だけを見る。 */
function workList(): HTMLElement {
  return typedElement(
    document.querySelectorAll(".screen-nav-work-list")[0],
    HTMLElement,
    "依頼の手順の一覧",
  )
}

describe("いまの作業（帯の札と、押すと開く依頼の手順の一覧）", () => {
  it("依頼が一度も無ければ「依頼待ち」で、開くと「まだ依頼が無い」と出る", () => {
    renderScreenNav()

    expect(document.querySelector(".screen-nav-work-word")?.textContent).toBe("依頼待ち")

    fireEvent.click(workToggle())

    expect(within(workList()).getByText("まだ依頼が無い")).not.toBeNull()
  })

  it("雑談中の依頼待ちは「<名前> とおしゃべり中」になり、印が埋まる（docs/screen-design.md 13.9）", () => {
    renderScreenNav({ chatMode: true, character: characterInfo({ name: "架空の精霊" }) })

    expect(document.querySelector(".screen-nav-work-word")?.textContent).toBe(
      "架空の精霊 とおしゃべり中",
    )
    expect(document.querySelector(".screen-nav-work-mark")?.textContent).toBe("●")
    expect(document.querySelector(".screen-nav-work")?.getAttribute("data-chat-idle")).toBe("true")
  })

  it("雑談中でも答え待ち・作業中・止まっているは語を変えない", () => {
    renderScreenNav({
      chatMode: true,
      character: characterInfo({ name: "架空の精霊" }),
      turn: { kind: "running", startedAt: 0 },
      records: [requestRecord()],
    })

    expect(document.querySelector(".screen-nav-work-word")?.textContent).toBe("作業中")
  })

  it("実行中のツールが札に出る（作業中・要約つき）", () => {
    renderScreenNav({
      turn: { kind: "running", startedAt: 0 },
      records: [
        requestRecord(),
        toolRecord({ toolUseId: "toolu_1", name: "Bash", input: { command: "echo dummy" } }),
      ],
    })

    expect(document.querySelector(".screen-nav-work-word")?.textContent).toBe("作業中")
    expect(document.querySelector(".screen-nav-work-summary")?.textContent).toBe("Bash: echo dummy")
  })

  describe("背景のタスク（docs/screen-design.md 13.9「背景のタスク」）", () => {
    const FINISHED_TURN = {
      kind: "finished",
      startedAt: 0,
      finishedAt: 1,
      ending: { kind: "ended" },
    } satisfies SessionState["turn"]
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

    it("ターンが終わっても背景のタスクが動いていれば「背景で作業中」で、要約はその説明", () => {
      renderScreenNav({
        turn: FINISHED_TURN,
        records: [requestRecord()],
        backgroundTasks: [SHELL_TASK],
      })

      expect(document.querySelector(".screen-nav-work")?.getAttribute("data-work-state")).toBe(
        "background",
      )
      expect(document.querySelector(".screen-nav-work-word")?.textContent).toBe("背景で作業中")
      expect(document.querySelector(".screen-nav-work-mark")?.textContent).toBe("●")
      expect(document.querySelector(".screen-nav-work-summary")?.textContent).toBe("架空の待ち")
    })

    it("2件以上なら新しいほうの説明に「ほか n件」を添え、説明が無ければ種類の語で代える", () => {
      renderScreenNav({ turn: FINISHED_TURN, backgroundTasks: [SHELL_TASK, AGENT_TASK] })

      expect(document.querySelector(".screen-nav-work-summary")?.textContent).toBe(
        "サブエージェント ほか1件",
      )
    })

    it("開くと「背景で動いているもの」に種類と説明が並ぶ", () => {
      renderScreenNav({ turn: FINISHED_TURN, backgroundTasks: [SHELL_TASK, AGENT_TASK] })

      fireEvent.click(workToggle())

      expect(document.querySelector(".screen-nav-work-background-heading")?.textContent).toBe(
        "背景で動いているもの（2 件）",
      )
      const rows = [...document.querySelectorAll(".screen-nav-work-background-task")]
      expect(rows.map((row) => row.textContent)).toEqual([
        "… シェル 架空の待ち",
        "… サブエージェント",
      ])
    })

    it("ターンが走っている間は「作業中」のままで、一覧には背景のタスクも出る", () => {
      renderScreenNav({
        turn: { kind: "running", startedAt: 0 },
        records: [requestRecord()],
        backgroundTasks: [SHELL_TASK],
      })

      expect(document.querySelector(".screen-nav-work-word")?.textContent).toBe("作業中")

      fireEvent.click(workToggle())

      expect(document.querySelector(".screen-nav-work-background-heading")).not.toBeNull()
    })

    it("背景のタスクが終わると「依頼待ち」に戻り、一覧からも消える", () => {
      const store = renderScreenNav({
        turn: FINISHED_TURN,
        records: [requestRecord()],
        backgroundTasks: [SHELL_TASK],
      })
      fireEvent.click(workToggle())

      act(() => {
        putState(store, {
          ...INITIAL_SESSION_STATE,
          turn: FINISHED_TURN,
          records: [requestRecord()],
          backgroundTasks: [],
        })
      })

      expect(document.querySelector(".screen-nav-work-word")?.textContent).toBe("依頼待ち")
      expect(document.querySelector(".screen-nav-work-summary")).toBeNull()
      expect(document.querySelector(".screen-nav-work-background-heading")).toBeNull()
    })
  })

  describe("振り返り中（成果の振り返り。docs/screen-design.md 13.9「いまの作業」）", () => {
    it("diaryWriting が writing なら「振り返り中」で、要約は「<日付>の日記を書いています」", () => {
      renderScreenNav({
        diaryWriting: { kind: "writing", date: "2026-09-23", startedAt: 0, stage: "read" },
      })

      expect(document.querySelector(".screen-nav-work")?.getAttribute("data-work-state")).toBe(
        "diary",
      )
      expect(document.querySelector(".screen-nav-work-word")?.textContent).toBe("振り返り中")
      expect(document.querySelector(".screen-nav-work-mark")?.textContent).toBe("●")
      expect(document.querySelector(".screen-nav-work-summary")?.textContent).toBe(
        "9月23日の日記を書いています",
      )
    })

    it("答え待ちのほうが振り返り中より強い", () => {
      renderScreenNav({
        turn: { kind: "running", startedAt: 0 },
        pending: [FIXTURE_PENDING],
        diaryWriting: { kind: "writing", date: "2026-09-23", startedAt: 0, stage: "read" },
      })

      expect(document.querySelector(".screen-nav-work-word")?.textContent).toBe("答え待ち")
    })

    it("会話のターンが動いていれば「作業中」が勝つ（振り返りは会話と並んで進むため）", () => {
      renderScreenNav({
        turn: { kind: "running", startedAt: 0 },
        diaryWriting: { kind: "writing", date: "2026-09-23", startedAt: 0, stage: "write" },
      })

      expect(document.querySelector(".screen-nav-work-word")?.textContent).toBe("作業中")
    })

    it("会話のターンが動いていなければ「振り返り中」になる", () => {
      renderScreenNav({
        diaryWriting: { kind: "writing", date: "2026-09-23", startedAt: 0, stage: "write" },
      })

      expect(document.querySelector(".screen-nav-work-word")?.textContent).toBe("振り返り中")
    })

    it("written / failed / idle は「振り返り中」にならない", () => {
      renderScreenNav({ diaryWriting: { kind: "written", date: "2026-09-23", writtenAt: 0 } })
      expect(document.querySelector(".screen-nav-work-word")?.textContent).not.toBe("振り返り中")

      cleanup()
      renderScreenNav({ diaryWriting: { kind: "failed", date: "2026-09-23" } })
      expect(document.querySelector(".screen-nav-work-word")?.textContent).not.toBe("振り返り中")
    })
  })

  it("答え待ちで札の語が「答え待ち」に変わり、要約も出る", () => {
    renderScreenNav({
      turn: { kind: "running", startedAt: 0 },
      pending: [FIXTURE_PENDING],
      records: [
        requestRecord(),
        toolRecord({ toolUseId: "toolu_1", name: "Bash", input: { command: "echo dummy" } }),
      ],
    })

    expect(document.querySelector(".screen-nav-work-word")?.textContent).toBe("答え待ち")
    expect(document.querySelector(".screen-nav-work-summary")?.textContent).toBe("Bash: echo dummy")
  })

  it("答え待ちが質問だと、実行中のツールの要約より質問の要約を優先して札に出る", () => {
    renderScreenNav({
      turn: { kind: "running", startedAt: 0 },
      pending: [questionPending(["最初の見出し"])],
      records: [
        requestRecord(),
        toolRecord({ toolUseId: "toolu_1", name: "Bash", input: { command: "echo dummy" } }),
      ],
    })

    expect(document.querySelector(".screen-nav-work-word")?.textContent).toBe("答え待ち")
    expect(document.querySelector(".screen-nav-work-summary")?.textContent).toBe("最初の見出し")
  })

  it("質問が2問以上あれば、要約に「ほか n問」を添える", () => {
    renderScreenNav({
      pending: [questionPending(["最初の見出し", "2問目", "3問目"])],
    })

    expect(document.querySelector(".screen-nav-work-summary")?.textContent).toBe(
      "最初の見出し ほか2問",
    )
  })

  it("答え待ちが質問だと、一覧の見出しに「入力欄の上で答えられる」は添えず、「質問へ」を出す", () => {
    renderScreenNav({ pending: [questionPending(["最初の見出し"])] })

    fireEvent.click(workToggle())

    expect(document.querySelector(".screen-nav-work-heading")?.textContent).toBe("答え待ち")
    expect(screen.getByRole("button", { name: "質問へ" })).toBeDefined()
  })

  it("答え待ちが許可要求なら、今までどおり「入力欄の上で答えられる」を添え、「質問へ」は出さない", () => {
    renderScreenNav({ pending: [FIXTURE_PENDING] })

    fireEvent.click(workToggle())

    expect(document.querySelector(".screen-nav-work-heading")?.textContent).toBe(
      "答え待ち。入力欄の上で答えられる",
    )
    expect(screen.queryByRole("button", { name: "質問へ" })).toBeNull()
  })

  it("「質問へ」を押すと、一覧を閉じて会話の画面・最新のやり取りへ戻し、質問の札へのスクロールを合図する", () => {
    window.location.hash = "#character"
    const moved: number[] = []
    let scrollCount = 0
    renderScreenNav(
      { pending: [questionPending(["最初の見出し"])] },
      {
        selection: { activeTurnId: 1, newestTurnId: 3, selectTurn: (id) => moved.push(id) },
        scroll: { requestScroll: () => (scrollCount += 1) },
      },
    )

    fireEvent.click(workToggle())
    fireEvent.click(screen.getByRole("button", { name: "質問へ" }))

    expect(document.querySelector(".screen-nav-work-list")).toBeNull()
    expect(parseHash(window.location.hash).screen).toBe("conversation")
    expect(moved).toEqual([3])
    expect(scrollCount).toBe(1)
  })

  it("答え終わると、質問の要約と「質問へ」が消えて元に戻る", () => {
    const store = renderScreenNav({
      turn: { kind: "running", startedAt: 0 },
      pending: [questionPending(["最初の見出し"])],
      records: [requestRecord()],
    })

    expect(document.querySelector(".screen-nav-work-word")?.textContent).toBe("答え待ち")
    expect(document.querySelector(".screen-nav-work-summary")?.textContent).toBe("最初の見出し")

    act(() => {
      putState(store, {
        ...INITIAL_SESSION_STATE,
        turn: { kind: "running", startedAt: 0 },
        pending: [],
        records: [requestRecord()],
      })
    })

    expect(document.querySelector(".screen-nav-work-word")?.textContent).toBe("作業中")
    expect(document.querySelector(".screen-nav-work-summary")).toBeNull()

    fireEvent.click(workToggle())
    expect(screen.queryByRole("button", { name: "質問へ" })).toBeNull()
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

    expect(document.querySelector(".screen-nav-work-full-heading")?.textContent).toBe(
      "実行中の Bash",
    )
    expect(document.querySelector(".screen-nav-work-full-text")?.textContent).toBe(longCommand)
  })

  it("一覧に済み・実行中が古い→新しいの順で並ぶ", () => {
    renderScreenNav({
      turn: { kind: "running", startedAt: 0 },
      records: [
        requestRecord(),
        toolRecord({
          toolUseId: "toolu_old",
          name: "Read",
          input: { file_path: "/tmp/old.txt" },
          status: { kind: "finished", result: { content: "ok", isError: false } },
        }),
        toolRecord({ toolUseId: "toolu_new", name: "Bash", input: { command: "echo new" } }),
      ],
    })

    fireEvent.click(workToggle())

    const rows = document.querySelectorAll(".screen-nav-work-steps li")
    expect([...rows].map((row) => row.textContent)).toEqual([
      "✓ Read: /tmp/old.txt",
      "… Bash: echo new",
    ])
  })

  it("6件以上あると「手順をすべて見る」の口が出て、押すと全件に広がる", () => {
    const records = [
      requestRecord(),
      ...Array.from({ length: 6 }, (_unused, index) =>
        toolRecord({
          toolUseId: `toolu_${String(index)}`,
          name: "Read",
          input: { file_path: `/tmp/${String(index)}.txt` },
          status: { kind: "finished", result: { content: "ok", isError: false } },
        }),
      ),
    ]
    renderScreenNav({ records })

    fireEvent.click(workToggle())

    expect(document.querySelectorAll(".screen-nav-work-steps li")).toHaveLength(5)
    const toggleAll = screen.getByRole("button", { name: "手順をすべて見る（全 6 件）" })

    fireEvent.click(toggleAll)

    expect(document.querySelectorAll(".screen-nav-work-steps li")).toHaveLength(6)
    expect(screen.getByRole("button", { name: "新しい5件だけにする" })).toBeDefined()
  })

  it("5件の外に失敗があれば「すべて見る」の口に失敗の数を添える", () => {
    const records = [
      requestRecord(),
      toolRecord({
        toolUseId: "toolu_failed",
        name: "Bash",
        input: { command: "架空のコマンド" },
        status: { kind: "finished", result: { content: "架空のエラー出力", isError: true } },
      }),
      ...Array.from({ length: 5 }, (_unused, index) =>
        toolRecord({
          toolUseId: `toolu_${String(index)}`,
          name: "Read",
          input: { file_path: `/tmp/${String(index)}.txt` },
          status: { kind: "finished", result: { content: "ok", isError: false } },
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
          status: { kind: "finished", result: { content: "架空のエラー出力", isError: true } },
        }),
      ],
    })

    fireEvent.click(workToggle())

    expect(screen.getByText("失敗")).toBeDefined()
    expect(document.querySelector(".screen-nav-work-failure-output")?.textContent).toContain(
      "架空のエラー出力",
    )
    expect(document.querySelector(".screen-nav-work-failure-input")?.textContent).toContain(
      "架空のコマンド",
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

    expect(document.querySelector(".screen-nav-work-steps li")?.textContent).toBe("… Bash: echo")
  })

  it("セッションが終わると「止まっている」になり、実行中だった手順は一覧から消える", () => {
    renderScreenNav({
      endedReason: "セッションが終了した",
      records: [
        requestRecord(),
        toolRecord({ toolUseId: "toolu_1", name: "Bash", input: { command: "echo" } }),
      ],
    })

    expect(document.querySelector(".screen-nav-work-word")?.textContent).toBe("止まっている")

    fireEvent.click(workToggle())

    expect(within(workList()).getByText("この依頼ではまだツールを使っていない")).not.toBeNull()
  })

  it("もう一度押す・外側を押す・Esc で閉じる（Esc はフォーカスを札へ戻す）", () => {
    renderScreenNav({ records: [requestRecord()] })
    const toggle = workToggle()

    fireEvent.click(toggle)
    expect(document.querySelector(".screen-nav-work-list")).not.toBeNull()

    fireEvent.click(toggle)
    expect(document.querySelector(".screen-nav-work-list")).toBeNull()

    fireEvent.click(toggle)
    fireEvent.pointerDown(document.body)
    expect(document.querySelector(".screen-nav-work-list")).toBeNull()

    fireEvent.click(toggle)
    fireEvent.keyDown(document, { key: "Escape" })
    expect(document.querySelector(".screen-nav-work-list")).toBeNull()
    expect(document.activeElement).toBe(toggle)
  })

  // 狭い画面では札そのものが「≡」の面の中にあり、Esc は面ごと閉じる（「≡」も同じ合図で
  // 閉じる。`browser/hooks/use-dismiss-signal.ts`）ので、戻り先の札は DOM から消える。
  // **帯の側の札（狭い画面では `display: none`）へフォーカスを飛ばさない**ことをここで守る。
  it("「≡」の面の中の札でも Esc で閉じ、隠れている帯の側の札へは戻さない", () => {
    renderScreenNav({ records: [requestRecord()] })
    fireEvent.click(screen.getByRole("button", { name: "メニュー" }))

    fireEvent.click(panelWorkToggle())
    expect(document.querySelector(".screen-nav-panel .screen-nav-work-list")).not.toBeNull()

    fireEvent.keyDown(document, { key: "Escape" })

    expect(document.querySelector(".screen-nav-panel")).toBeNull()
    expect(document.activeElement).not.toBe(workToggle())
    expect(document.activeElement).toBe(document.body)
  })
})
