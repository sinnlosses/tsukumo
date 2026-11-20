import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type {
  WorkflowSettingChange,
  WorkflowSettingView,
} from "../../../../../src/shared/workflow-setting/workflow-setting.ts"
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

// 設定のダイアログの「ワークフロー」の面の未保存の下書き。
// 閉じる・別のページへ移る前に確かめ、選んだとおりに捨てるか保存する。

afterEach(tearDownWorkflowFace)

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
        ],
        current,
      },
    ],
  }
}

const AFTER = ["架空:乙", "架空:甲"]

function renderDirty(): ReturnType<typeof renderWorkflowFace> {
  return renderWorkflowFace(
    () => rpcOutput(stepsView(["架空:甲", "架空:乙"])),
    (): WorkflowSettingChange => ({ kind: "view", view: stepsView(AFTER) }),
  )
}

function isOpen(): boolean {
  return screen.queryByRole("navigation", { name: "設定の項目" }) !== null
}

function closeButton(): HTMLElement {
  return within(dialog()).getByRole("button", { name: "閉じる（Esc）" })
}

function confirmButton(name: string): HTMLElement {
  return within(screen.getByRole("alertdialog", { name: "未保存の変更" })).getByRole("button", {
    name,
  })
}

function confirm(): HTMLElement | null {
  return screen.queryByRole("alertdialog", { name: "未保存の変更" })
}

describe("設定のダイアログの「ワークフロー」の未保存", () => {
  it("下書きがあるとナビに点、下の帯に件数が出る", async () => {
    renderDirty()
    await stepList()
    const navItem = within(dialog()).getByRole("button", { name: /ワークフロー/u })
    expect(navItem.getAttribute("title")).toBeNull()

    fireEvent.click(menuItem("架空の甲", "ひとつ下へ"))

    expect(navItem.getAttribute("title")).toBe("未保存の変更がある")
    expect(within(dialog()).getByText("未保存の変更 1件")).toBeDefined()
  })

  it("未保存で × を押すと確認が出て、捨てると書かずに閉じる", async () => {
    const sent = renderDirty()
    await stepList()
    fireEvent.click(menuItem("架空の甲", "ひとつ下へ"))

    fireEvent.click(closeButton())

    expect(confirm()).not.toBeNull()
    expect(isOpen()).toBe(true)
    fireEvent.click(confirmButton("捨てて閉じる"))
    expect(isOpen()).toBe(false)
    expect(setCommands(sent)).toEqual([])
  })

  it("保存して閉じるを選ぶと、書いてから閉じる", async () => {
    const sent = renderDirty()
    await stepList()
    fireEvent.click(menuItem("架空の甲", "ひとつ下へ"))

    fireEvent.click(closeButton())
    fireEvent.click(confirmButton("保存して閉じる"))

    await waitFor(() => {
      expect(isOpen()).toBe(false)
    })
    expect(setCommands(sent)).toEqual([
      { procedure: "workflowSetting.set", key: "steps", value: JSON.stringify(AFTER) },
    ])
  })

  it("未保存で別のページへ移ろうとすると確認が出て、捨てると移る", async () => {
    renderDirty()
    await stepList()
    fireEvent.click(menuItem("架空の甲", "ひとつ下へ"))

    fireEvent.click(within(dialog()).getByRole("button", { name: "見た目" }))

    expect(confirm()).not.toBeNull()
    expect(
      within(dialog())
        .getByRole("button", { name: /ワークフロー/u })
        .getAttribute("aria-current"),
    ).toBe("page")
    fireEvent.click(confirmButton("捨てて移る"))
    expect(
      within(dialog()).getByRole("button", { name: "見た目" }).getAttribute("aria-current"),
    ).toBe("page")
    expect(confirm()).toBeNull()
  })

  it("未保存でなければ、確認を出さずに閉じる", async () => {
    renderDirty()
    await stepList()

    fireEvent.click(closeButton())

    expect(confirm()).toBeNull()
    expect(isOpen()).toBe(false)
  })

  it("下書きを「やめる」で戻したあとは、確認を出さずに閉じる", async () => {
    renderDirty()
    await stepList()
    fireEvent.click(menuItem("架空の甲", "ひとつ下へ"))
    fireEvent.click(bandButton("やめる"))

    fireEvent.click(closeButton())

    expect(confirm()).toBeNull()
    expect(isOpen()).toBe(false)
  })
})
