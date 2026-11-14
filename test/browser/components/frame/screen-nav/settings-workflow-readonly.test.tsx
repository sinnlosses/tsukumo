import { fireEvent, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { WorkflowSettingView } from "../../../../../src/shared/workflow-setting/workflow-setting.ts"
import { typedElement } from "../../../../typed-element.ts"
import { rpcOutput } from "../../../rpc-fetch-stub.ts"
import {
  bandButton,
  dialog,
  menuItem,
  REPOSITORY,
  renderWorkflowFace,
  setCommands,
  stepList,
  tearDownWorkflowFace,
} from "./workflow-face.tsx"

// 設定のダイアログの「ワークフロー」の面の、読み取り専用（`readonly`）の欄。
// 入力を置かず、名前・説明・値だけを schema の順に描き、下書きや帯の数に入れない。

afterEach(tearDownWorkflowFace)

const VIEW: WorkflowSettingView = {
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
      ],
      current: ["架空:甲", "架空:乙"],
    },
    {
      kind: "readonly",
      key: "tracker",
      label: "架空の固定",
      description: "架空の固定の説明",
      current: "架空の固定値",
    },
    {
      kind: "command",
      key: "verify",
      label: "架空のコマンド",
      description: "架空のコマンドの説明",
      current: "架空の検証",
    },
    {
      kind: "readonly",
      key: "project",
      label: "架空の未設定",
      description: "",
      current: "-",
    },
  ],
}

function bandText(): string | null {
  return typedElement(dialog().querySelector("footer"), HTMLElement, "下の帯").textContent
}

function isDisabled(name: "保存" | "やめる"): boolean {
  return bandButton(name).getAttribute("aria-disabled") === "true"
}

function readonlyField(label: string): HTMLElement {
  const head = within(dialog()).getByText(label, { selector: "p" })
  return typedElement(head.closest("div")?.parentElement ?? null, HTMLElement, "読み取り専用の欄")
}

describe("設定のダイアログの「ワークフロー」の面（読み取り専用）", () => {
  it("読み取り専用の欄を schema の順に、名前・説明・値で出す", async () => {
    renderWorkflowFace(() => rpcOutput(VIEW))
    await stepList()

    const labels = Array.from(dialog().querySelectorAll("p, label"))
      .map((element) => element.textContent)
      .filter((text) =>
        ["スキルの並び", "架空の固定", "架空のコマンド", "架空の未設定"].includes(text ?? ""),
      )
    expect(labels).toEqual(["スキルの並び", "架空の固定", "架空のコマンド", "架空の未設定"])
    expect(readonlyField("架空の固定").textContent).toContain("架空の固定の説明")
    expect(readonlyField("架空の固定").textContent).toContain("架空の固定値")
    expect(readonlyField("架空の未設定").textContent).toContain("-")
  })

  it("読み取り専用の欄には入力・ラジオ・ボタンを置かない", async () => {
    renderWorkflowFace(() => rpcOutput(VIEW))
    await stepList()

    const field = readonlyField("架空の固定")
    expect(within(field).queryAllByRole("textbox")).toEqual([])
    expect(within(field).queryAllByRole("radio")).toEqual([])
    expect(within(field).queryAllByRole("button")).toEqual([])
    expect(field.querySelector("input, textarea, button")).toBeNull()
  })

  it("何も触らなければ帯は押せず、並びを動かしても帯は「並びを変えた」で書く欄にも読み取り専用を数えない", async () => {
    const sent = renderWorkflowFace(() => rpcOutput(VIEW))
    await stepList()

    expect(isDisabled("保存")).toBe(true)
    expect(isDisabled("やめる")).toBe(true)
    expect(bandText()).toBe("やめる保存")

    fireEvent.click(menuItem("架空の甲", "ひとつ下へ"))
    expect(bandText()).toBe("● 並びを変えたやめる保存")
    expect(isDisabled("保存")).toBe(false)

    fireEvent.click(bandButton("保存"))
    await waitFor(() => {
      expect(setCommands(sent).map((command) => ("key" in command ? command.key : ""))).toEqual([
        "steps",
      ])
    })
  })

  it("読み取り専用の欄だけの面でも、保存の帯は押せない", async () => {
    renderWorkflowFace(() =>
      rpcOutput({
        kind: "available",
        repository: REPOSITORY,
        fields: [
          {
            kind: "readonly",
            key: "tracker",
            label: "架空の固定",
            description: "架空の固定の説明",
            current: "架空の固定値",
          },
        ],
      } satisfies WorkflowSettingView),
    )

    await within(dialog()).findByText("架空の固定値")

    expect(isDisabled("保存")).toBe(true)
    expect(isDisabled("やめる")).toBe(true)
  })
})
