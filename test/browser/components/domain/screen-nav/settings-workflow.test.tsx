import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ScreenNav } from "../../../../../src/browser/components/domain/screen-nav/screen-nav.tsx"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session/session-state.ts"
import type {
  WorkflowSettingChange,
  WorkflowSettingView,
} from "../../../../../src/shared/workflow-setting/workflow-setting.ts"
import { typedElement } from "../../../../typed-element.ts"
import { EMPTY_NAV_DRAWER_SLOTS } from "../../../nav-drawer-slot.tsx"
import { queryClientWrapper } from "../../../query-client.tsx"
import { rpcError, rpcOutput, stubRpcFetch, type RpcFetchStub } from "../../../rpc-fetch-stub.ts"
import { putSession, type SentCommand } from "../../../session-store.ts"

// 設定のダイアログの「ワークフロー」の面（docs/architecture/screen-design.md「設定の歯車」、
// docs/architecture/workflow-contract.md「設定コマンド」）。
// 欄は `workflowSetting.read` が返した形だけから描き、選ぶと `workflowSetting.set` を送って返った面に替える。

const REPOSITORY = {
  worktreeName: "架空の作業ツリー",
  configPath: "/架空/作業ツリー/.tw/config.toml",
}

function availableView(acceptor: string): WorkflowSettingView {
  return {
    kind: "available",
    repository: REPOSITORY,
    defaultWord: "既定",
    noneWord: "なし",
    fields: [
      {
        kind: "choice",
        key: "flow",
        label: "流れ",
        description: "架空の流れの説明",
        values: [
          { value: "delegate", label: "委譲する", description: "" },
          { value: "main", label: "メインで行う", description: "" },
        ],
        current: "delegate",
      },
      {
        kind: "part",
        key: "parts.acceptor",
        label: "受け入れ役",
        description: "架空の受け入れ役の説明",
        candidates: "agent",
        allowNone: false,
        current: acceptor,
      },
      {
        kind: "part",
        key: "parts.retrospect",
        label: "振り返り",
        description: "架空の振り返りの説明",
        candidates: "skill",
        allowNone: true,
        current: "既定",
      },
    ],
  }
}

const NAMES: Partial<SessionState> = {
  skillNames: ["架空のスキル"],
  agentNames: ["架空のプラグイン:架空の役"],
}

let rpcStub: RpcFetchStub | undefined

afterEach(() => {
  cleanup()
  rpcStub?.restore()
  rpcStub = undefined
})

function renderWorkflowFace(
  read: () => ReturnType<typeof rpcOutput>,
  onSet: (command: SentCommand) => unknown = () => undefined,
): SentCommand[] {
  const sent: SentCommand[] = []
  // 帯はほかの手続き（作業ディレクトリの名前など）も引くので、この面の読み取りにだけ `read` を返す。
  rpcStub = stubRpcFetch((call) =>
    call.procedure === "workflowSetting/read" ? read() : { kind: "pending" },
  )
  putSession({ ...INITIAL_SESSION_STATE, ...NAMES }, (command) => {
    sent.push(command)
    return onSet(command)
  })
  render(<ScreenNav drawer={EMPTY_NAV_DRAWER_SLOTS} />, { wrapper: queryClientWrapper() })
  fireEvent.click(
    typedElement(
      document.querySelector(".screen-nav > .screen-nav-settings .screen-nav-settings-toggle"),
      HTMLElement,
      "帯の歯車",
    ),
  )
  fireEvent.click(within(dialog()).getByRole("button", { name: "ワークフロー" }))
  return sent
}

function dialog(): HTMLElement {
  return screen.getByRole("dialog", { name: "設定" })
}

function select(label: string): HTMLSelectElement {
  return typedElement(
    within(dialog()).getByRole("combobox", { name: label }),
    HTMLSelectElement,
    `「${label}」のプルダウン`,
  )
}

function optionValues(label: string): string[] {
  return [...select(label).options].map((option) => option.value)
}

function stepsView(current: readonly string[]): WorkflowSettingView {
  return {
    kind: "available",
    repository: REPOSITORY,
    defaultWord: "",
    noneWord: "",
    fields: [
      {
        kind: "steps",
        key: "steps",
        label: "スキルの並び",
        description: "架空の並びの説明",
        values: [
          { value: "架空:甲", label: "甲", description: "" },
          { value: "架空:乙", label: "乙", description: "" },
          { value: "架空:丙", label: "丙", description: "" },
        ],
        current,
      },
    ],
  }
}

function stepButton(name: string): HTMLElement {
  return within(dialog()).getByRole("button", { name })
}

describe("設定のダイアログの「ワークフロー」の面（スキルの並び）", () => {
  it("並びを番号付きの行で出し、候補に無い名前も残して印を付け、足せる候補だけをプルダウンに出す", async () => {
    renderWorkflowFace(() => rpcOutput(stepsView(["架空:乙", "架空:消えた"])))

    const list = await within(dialog()).findByRole("list", { name: "スキルの並び" })

    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["乙上へ下へ外す", "架空:消えた候補に無い上へ下へ外す"])
    expect(optionValues("スキルの並びに足す")).toEqual(["", "架空:甲", "架空:丙"])
  })

  it("先頭の上へ・末尾の下へは押せず、押しても書かない", async () => {
    const sent = renderWorkflowFace(() => rpcOutput(stepsView(["架空:甲", "架空:乙"])))
    await within(dialog()).findByRole("list", { name: "スキルの並び" })

    expect(stepButton("甲 を上へ").getAttribute("aria-disabled")).toBe("true")
    expect(stepButton("乙 を下へ").getAttribute("aria-disabled")).toBe("true")
    fireEvent.click(stepButton("甲 を上へ"))

    expect(sent).toEqual([])
  })

  it.each([
    ["下へ", "甲 を下へ", ["架空:乙", "架空:甲", "架空:丙"]],
    ["上へ", "丙 を上へ", ["架空:甲", "架空:丙", "架空:乙"]],
    ["外す", "乙 を外す", ["架空:甲", "架空:丙"]],
  ])("%s を押すと並び全体を1行の JSON で書く", async (_operation, name, expected) => {
    const sent = renderWorkflowFace(() => rpcOutput(stepsView(["架空:甲", "架空:乙", "架空:丙"])))
    await within(dialog()).findByRole("list", { name: "スキルの並び" })

    fireEvent.click(stepButton(name))

    await waitFor(() => {
      expect(sent).toContainEqual({
        procedure: "workflowSetting.set",
        key: "steps",
        value: JSON.stringify(expected),
      })
    })
  })

  it("プルダウンから足すと並びの末尾に加えて書く", async () => {
    const sent = renderWorkflowFace(() => rpcOutput(stepsView(["架空:甲"])))
    await within(dialog()).findByRole("list", { name: "スキルの並び" })

    fireEvent.change(select("スキルの並びに足す"), { target: { value: "架空:丙" } })

    await waitFor(() => {
      expect(sent).toContainEqual({
        procedure: "workflowSetting.set",
        key: "steps",
        value: JSON.stringify(["架空:甲", "架空:丙"]),
      })
    })
  })

  it("最後の1つは外せない", async () => {
    const sent = renderWorkflowFace(() => rpcOutput(stepsView(["架空:甲"])))
    await within(dialog()).findByRole("list", { name: "スキルの並び" })

    expect(stepButton("甲 を外す").getAttribute("aria-disabled")).toBe("true")
    fireEvent.click(stepButton("甲 を外す"))

    expect(sent).toEqual([])
  })

  it("候補が尽きたら足すプルダウンを出さない", async () => {
    renderWorkflowFace(() => rpcOutput(stepsView(["架空:甲", "架空:乙", "架空:丙"])))
    await within(dialog()).findByRole("list", { name: "スキルの並び" })

    expect(within(dialog()).queryByRole("combobox", { name: "スキルの並びに足す" })).toBeNull()
  })
})

describe("設定のダイアログの「ワークフロー」の面", () => {
  it("見出しの下にリポジトリを出し、欄ごとにプルダウンを並べる。候補は SDK の名前から作る", async () => {
    renderWorkflowFace(() => rpcOutput(availableView("既定")))

    await within(dialog()).findByRole("combobox", { name: "受け入れ役" })

    expect(dialog().textContent).toContain("架空の作業ツリー のリポジトリ")
    expect(dialog().textContent).toContain("/架空/作業ツリー/.tw/config.toml")
    expect(optionValues("流れ")).toEqual(["delegate", "main"])
    expect(optionValues("受け入れ役")).toEqual(["既定", "架空のプラグイン:架空の役"])
    expect(optionValues("振り返り")).toEqual(["既定", "なし", "架空のスキル"])
    expect(select("受け入れ役").value).toBe("既定")
    expect(within(dialog()).queryByRole("button", { name: "既定に戻す" })).toBeNull()
  })

  it("選ぶと workflowSetting.set を送り、返った面の値を出す", async () => {
    const sent = renderWorkflowFace(
      () => rpcOutput(availableView("既定")),
      (): WorkflowSettingChange => ({
        kind: "view",
        view: availableView("架空のプラグイン:架空の役"),
      }),
    )
    await within(dialog()).findByRole("combobox", { name: "受け入れ役" })

    fireEvent.change(select("受け入れ役"), { target: { value: "架空のプラグイン:架空の役" } })

    await waitFor(() => {
      expect(select("受け入れ役").value).toBe("架空のプラグイン:架空の役")
    })
    expect(sent).toContainEqual({
      procedure: "workflowSetting.set",
      key: "parts.acceptor",
      value: "架空のプラグイン:架空の役",
    })
  })

  it("ワークフローが値を断ったら、その欄の下に理由を出して値は変えない", async () => {
    renderWorkflowFace(
      () => rpcOutput(availableView("既定")),
      (): WorkflowSettingChange => ({
        kind: "failed",
        key: "parts.acceptor",
        message: "架空の断りの理由",
      }),
    )
    await within(dialog()).findByRole("combobox", { name: "受け入れ役" })

    fireEvent.change(select("受け入れ役"), { target: { value: "架空のプラグイン:架空の役" } })

    expect(await within(dialog()).findByText("架空の断りの理由")).toBeTruthy()
    expect(select("受け入れ役").value).toBe("既定")
  })

  it.each([
    ["tw-missing", "/架空/bin/tw", "tw コマンドが見つからない（/架空/bin/tw）"],
    ["schema-unsupported", "", "tw が設定コマンド"],
    ["config-missing", "", "このリポジトリに .tw/config.toml が無い"],
    ["config-unreadable", "架空の読めない理由", ".tw/config.toml を読めない: 架空の読めない理由"],
  ] as const)("%s のときは欄を出さず、何が無いかを言う", async (reason, detail, text) => {
    renderWorkflowFace(() =>
      rpcOutput({ kind: "unavailable", repository: REPOSITORY, reason, detail }),
    )

    expect(await within(dialog()).findByText(text, { exact: false })).toBeTruthy()
    expect(dialog().textContent).toContain("架空の作業ツリー のリポジトリ")
    expect(within(dialog()).queryAllByRole("combobox")).toHaveLength(0)
    expect(
      within(dialog()).getByRole("button", { name: "ワークフロー" }).getAttribute("aria-current"),
    ).toBe("page")
  })

  it("手続きが返らなければ、読めなかったことを言う", async () => {
    renderWorkflowFace(() => rpcError(500))

    expect(
      await within(dialog()).findByText("ワークフローの設定を読めなかった", { exact: false }),
    ).toBeTruthy()
    expect(within(dialog()).queryAllByRole("combobox")).toHaveLength(0)
  })
})
