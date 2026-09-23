import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { ScreenNav } from "../../../../src/browser/features/screen-nav/screen-nav.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { type PendingAsk } from "../../../../src/shared/pending-ask.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/shared/session-state.ts"
import { characterInfo } from "../../../fixture/character.ts"
import { requestRecord, toolRecord } from "../../../fixture/session-record.ts"
import { sessionStoreWith } from "../../session-store.ts"

// フィクスチャはすべて手で書いた架空の依頼・ツール呼び出し（docs/coding-standards.md「会話内容の扱い」）。

afterEach(() => {
  cleanup()
})

const FIXTURE_PENDING: PendingAsk = {
  kind: "permission",
  id: "ask-1",
  toolName: "Read",
  input: {},
}

function renderScreenNav(state: Partial<SessionState> = {}): void {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, ...state })
  render(
    <SessionStoreContext.Provider value={store}>
      <ScreenNav />
    </SessionStoreContext.Provider>,
  )
}

/** 帯（広い画面）にある「いまの作業」の札。 */
function workToggle(): HTMLElement {
  return document.querySelector(
    ".screen-nav > .screen-nav-work .screen-nav-work-toggle",
  ) as HTMLElement
}

describe("いまの作業（帯の札と、押すと開く依頼の手順の一覧）", () => {
  it("依頼が一度も無ければ「依頼待ち」で、開くと「まだ依頼が無い」と出る", () => {
    renderScreenNav()

    expect(document.querySelector(".screen-nav-work-word")?.textContent).toBe("依頼待ち")

    fireEvent.click(workToggle())

    expect(document.querySelector(".screen-nav-work-empty")?.textContent).toBe("まだ依頼が無い")
  })

  it("雑談中の依頼待ちは「<名前> とおしゃべり中」になり、印が埋まる（docs/design.md 13.9）", () => {
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
      turn: { kind: "finished", startedAt: 0, finishedAt: 100 },
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

    expect(document.querySelector(".screen-nav-work-empty")?.textContent).toBe(
      "この依頼ではまだツールを使っていない",
    )
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
})
