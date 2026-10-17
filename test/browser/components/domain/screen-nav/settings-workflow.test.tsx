import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ScreenNav } from "../../../../../src/browser/components/domain/screen-nav/screen-nav.tsx"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session/session-state.ts"
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
// 欄は `workflowSetting.read` が返した形だけから描き、操作は下書きだけを変え、保存で `workflowSetting.set` を送って返った面に替える。

const REPOSITORY = {
  worktreeName: "架空の作業ツリー",
  configPath: "/架空/作業ツリー/.tw/config.toml",
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
  putSession(INITIAL_SESSION_STATE, (command) => {
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

function stepsView(current: readonly string[]): WorkflowSettingView {
  return {
    kind: "available",
    repository: REPOSITORY,
    fields: [
      {
        kind: "steps",
        key: "steps",
        label: "スキルの並び",
        description: "架空の並びの説明",
        values: [
          { value: "架空:甲", label: "甲", title: "架空の甲", description: "" },
          { value: "架空:乙", label: "乙", title: "架空の乙", description: "" },
          { value: "架空:丙", label: "丙", title: "架空の丙", description: "" },
        ],
        current,
      },
    ],
  }
}

const MOVE_LABEL = {
  top: "いちばん上へ",
  up: "ひとつ上へ",
  down: "ひとつ下へ",
  bottom: "いちばん下へ",
} as const

function openMenu(title: string): HTMLElement {
  fireEvent.click(within(dialog()).getByRole("button", { name: `${title} の操作` }))
  return within(dialog()).getByRole("menu", { name: `${title} の操作` })
}

function menuItem(title: string, label: string): HTMLElement {
  return within(openMenu(title)).getByRole("menuitem", { name: label })
}

function moveStep(title: string, to: keyof typeof MOVE_LABEL): void {
  fireEvent.click(menuItem(title, MOVE_LABEL[to]))
}

function removeStep(title: string): void {
  fireEvent.click(menuItem(title, "並びから外す"))
}

function addStep(title: string): void {
  fireEvent.click(within(dialog()).getByRole("button", { name: `${title} を並びの最後に足す` }))
}

function flowText(): string | null {
  return typedElement(dialog().querySelector(".flow"), HTMLElement, "流れの帯").textContent
}

function bandButton(name: "保存" | "やめる"): HTMLElement {
  return within(dialog()).getByRole("button", { name })
}

async function stepList(): Promise<HTMLElement> {
  return within(dialog()).findByRole("list", { name: "スキルの並び" })
}

function stepTexts(list: HTMLElement): (string | null)[] {
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.textContent)
}

function setCommands(sent: readonly SentCommand[]): SentCommand[] {
  return sent.filter((command) => command.procedure === "workflowSetting.set")
}

describe("設定のダイアログの「ワークフロー」の面（スキルの並び）", () => {
  it("行に番号・名前・識別子を出し、候補に無い名前も残して印を付け、足せる候補を札に出す", async () => {
    renderWorkflowFace(() => rpcOutput(stepsView(["架空:乙", "架空:消えた"])))

    const list = await stepList()

    expect(stepTexts(list)).toEqual(["1架空の乙乙", "2架空:消えた候補に無い"])
    expect(flowText()).toBe("1架空の乙→2架空:消えた")
    expect(
      within(dialog())
        .getAllByRole("button", { name: /を並びの最後に足す$/u })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["架空の甲 を並びの最後に足す", "架空の丙 を並びの最後に足す"])
    expect(within(dialog()).queryByRole("combobox")).toBeNull()
  })

  it("「…」は並べ替え4つと「並びから外す」を持ち、先頭は上へ・末尾は下へが押せない", async () => {
    renderWorkflowFace(() => rpcOutput(stepsView(["架空:甲", "架空:乙"])))
    const list = await stepList()

    const firstMenu = openMenu("架空の甲")
    expect(
      within(firstMenu)
        .getAllByRole("menuitem")
        .map((item) => [item.textContent, item.getAttribute("aria-disabled")]),
    ).toEqual([
      ["いちばん上へ", "true"],
      ["ひとつ上へ", "true"],
      ["ひとつ下へ", "false"],
      ["いちばん下へ", "false"],
      ["並びから外す", "false"],
    ])
    fireEvent.click(within(firstMenu).getByRole("menuitem", { name: "ひとつ上へ" }))
    fireEvent.keyDown(firstMenu, { key: "Escape" })
    expect(stepTexts(list)).toEqual(["1架空の甲甲", "2架空の乙乙"])

    const lastMenu = openMenu("架空の乙")
    expect(
      ["ひとつ下へ", "いちばん下へ"].map((label) =>
        within(lastMenu).getByRole("menuitem", { name: label }).getAttribute("aria-disabled"),
      ),
    ).toEqual(["true", "true"])
  })

  it("いちばん上へ・いちばん下へで端まで動かし、流れの帯も同じ順になる", async () => {
    renderWorkflowFace(() => rpcOutput(stepsView(["架空:甲", "架空:乙", "架空:丙"])))
    const list = await stepList()

    moveStep("架空の丙", "top")
    expect(stepTexts(list)).toEqual([
      "1架空の丙丙● 並びを変えた",
      "2架空の甲甲● 並びを変えた",
      "3架空の乙乙● 並びを変えた",
    ])
    moveStep("架空の丙", "bottom")

    expect(stepTexts(list)).toEqual(["1架空の甲甲", "2架空の乙乙", "3架空の丙丙"])
    expect(flowText()).toBe("1架空の甲→2架空の乙→3架空の丙")
  })

  it("外すと「並びに入っていないスキル」の札に出て、押すと並びの最後に戻る", async () => {
    renderWorkflowFace(() => rpcOutput(stepsView(["架空:甲", "架空:乙", "架空:丙"])))
    const list = await stepList()
    expect(dialog().textContent).toContain("足せるスキルはない（3つとも並んでいる）")

    removeStep("架空の甲")

    expect(stepTexts(list)).toEqual(["1架空の乙乙● 並びを変えた", "2架空の丙丙● 並びを変えた"])
    expect(dialog().textContent).not.toContain("足せるスキルはない")
    addStep("架空の甲")
    expect(stepTexts(list)).toEqual([
      "1架空の乙乙● 並びを変えた",
      "2架空の丙丙● 並びを変えた",
      "3架空の甲甲● 並びを変えた",
    ])
  })

  it("外して位置が繰り上がった行にだけ「並びを変えた」の印を付ける", async () => {
    renderWorkflowFace(() => rpcOutput(stepsView(["架空:甲", "架空:乙", "架空:丙"])))
    const list = await stepList()

    removeStep("架空の乙")

    expect(stepTexts(list)).toEqual(["1架空の甲甲", "2架空の丙丙● 並びを変えた"])
  })

  it.each([
    ["ひとつ下へ", () => moveStep("架空の甲", "down"), ["架空:乙", "架空:甲", "架空:丙"]],
    ["ひとつ上へ", () => moveStep("架空の丙", "up"), ["架空:甲", "架空:丙", "架空:乙"]],
    ["並びから外す", () => removeStep("架空の乙"), ["架空:甲", "架空:丙"]],
  ])(
    "%s は下書きだけを変えて書かず、保存で並び全体を1回だけ書く",
    async (_operation, operate, expected) => {
      const sent = renderWorkflowFace(
        () => rpcOutput(stepsView(["架空:甲", "架空:乙", "架空:丙"])),
        (): WorkflowSettingChange => ({ kind: "view", view: stepsView(expected) }),
      )
      const list = await stepList()

      operate()

      expect(stepTexts(list)).toHaveLength(expected.length)
      expect(setCommands(sent)).toEqual([])
      fireEvent.click(bandButton("保存"))
      await waitFor(() => {
        expect(setCommands(sent)).toEqual([
          { procedure: "workflowSetting.set", key: "steps", value: JSON.stringify(expected) },
        ])
      })
    },
  )

  it("札から足すと下書きの並びの末尾に加わり、まだ書かない", async () => {
    const sent = renderWorkflowFace(() => rpcOutput(stepsView(["架空:甲"])))
    const list = await stepList()

    addStep("架空の丙")

    expect(stepTexts(list)).toEqual(["1架空の甲甲", "2架空の丙丙● 並びを変えた"])
    expect(setCommands(sent)).toEqual([])
  })

  it("最後の1つは外せない", async () => {
    renderWorkflowFace(() => rpcOutput(stepsView(["架空:甲"])))
    const list = await stepList()

    const menu = openMenu("架空の甲")
    const remove = within(menu).getByRole("menuitem", { name: "並びから外す" })
    expect(remove.getAttribute("aria-disabled")).toBe("true")
    fireEvent.click(remove)
    fireEvent.keyDown(menu, { key: "Escape" })

    expect(stepTexts(list)).toEqual(["1架空の甲甲"])
  })
})

describe("設定のダイアログの「ワークフロー」の面（リポジトリと書き込みの結果）", () => {
  it("見出しの下にリポジトリを出す", async () => {
    renderWorkflowFace(() => rpcOutput(stepsView(["架空:甲"])))

    await within(dialog()).findByRole("list", { name: "スキルの並び" })

    expect(dialog().textContent).toContain("架空の作業ツリー のリポジトリ")
    expect(dialog().textContent).toContain("/架空/作業ツリー/.tw/config.toml")
  })

  it("変更が無いあいだは「保存」「やめる」が押せず、変更中の印も出ない", async () => {
    renderWorkflowFace(() => rpcOutput(stepsView(["架空:甲"])))
    await stepList()

    expect(bandButton("保存").getAttribute("aria-disabled")).toBe("true")
    expect(bandButton("やめる").getAttribute("aria-disabled")).toBe("true")
    expect(dialog().textContent).not.toContain("並びを変えた")
  })

  it.each([
    ["外しただけなら、外したものの名前を言う", () => removeStep("架空の乙"), "架空の乙を外した"],
    ["並べ替えたら、並びを変えたと言う", () => moveStep("架空の甲", "down"), "並びを変えた"],
    ["足したら、並びを変えたと言う", () => addStep("架空の丙"), "並びを変えた"],
  ])("%s", async (_case, operate, text) => {
    renderWorkflowFace(() => rpcOutput(stepsView(["架空:甲", "架空:乙"])))
    await stepList()

    operate()

    expect(typedElement(dialog().querySelector("footer"), HTMLElement, "下の帯").textContent).toBe(
      `● ${text}やめる保存`,
    )
    expect(bandButton("保存").getAttribute("aria-disabled")).toBe("false")
  })

  it("保存すると返った面の並びを出し、「保存」がまた押せなくなる", async () => {
    renderWorkflowFace(
      () => rpcOutput(stepsView(["架空:甲"])),
      (): WorkflowSettingChange => ({ kind: "view", view: stepsView(["架空:甲", "架空:丙"]) }),
    )
    const list = await stepList()

    addStep("架空の丙")
    fireEvent.click(bandButton("保存"))

    await waitFor(() => {
      expect(bandButton("保存").getAttribute("aria-disabled")).toBe("true")
    })
    expect(stepTexts(list)).toEqual(["1架空の甲甲", "2架空の丙丙"])
  })

  it("ワークフローが値を断ったら、その欄の下に理由を出して下書きを残す", async () => {
    renderWorkflowFace(
      () => rpcOutput(stepsView(["架空:甲"])),
      (): WorkflowSettingChange => ({
        kind: "failed",
        key: "steps",
        message: "架空の断りの理由",
      }),
    )
    const list = await stepList()

    addStep("架空の丙")
    fireEvent.click(bandButton("保存"))

    expect(await within(dialog()).findByText("架空の断りの理由")).toBeTruthy()
    expect(stepTexts(list)).toHaveLength(2)
    expect(bandButton("保存").getAttribute("aria-disabled")).toBe("false")
  })

  it("「やめる」で今の値の並びに戻り、断りの理由も消える", async () => {
    renderWorkflowFace(
      () => rpcOutput(stepsView(["架空:甲", "架空:乙"])),
      (): WorkflowSettingChange => ({
        kind: "failed",
        key: "steps",
        message: "架空の断りの理由",
      }),
    )
    const list = await stepList()
    removeStep("架空の甲")
    fireEvent.click(bandButton("保存"))
    await within(dialog()).findByText("架空の断りの理由")

    fireEvent.click(bandButton("やめる"))

    expect(stepTexts(list)).toEqual(["1架空の甲甲", "2架空の乙乙"])
    expect(within(dialog()).queryByText("架空の断りの理由")).toBeNull()
    expect(bandButton("保存").getAttribute("aria-disabled")).toBe("true")
  })

  it.each([
    ["tw-missing", "/架空/bin/tw", "tw コマンドが見つからない（/架空/bin/tw）"],
    ["schema-unsupported", "", "tw が並び（schema 2）の設定コマンドを返さない"],
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
