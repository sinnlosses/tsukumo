import { fireEvent, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type {
  WorkflowSettingChange,
  WorkflowSettingView,
} from "../../../../../src/shared/workflow-setting/workflow-setting.ts"
import { typedElement } from "../../../../typed-element.ts"
import { rpcOutput } from "../../../rpc-fetch-stub.ts"
import type { SentCommand } from "../../../session-store.ts"
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

// 設定のダイアログの「ワークフロー」の面の、選択（`choice`）とコマンド（`command`）の欄。
// 欄は `workflowSetting.read` が返した形だけから描き、操作は下書きだけを変え、保存で欄ごとに `workflowSetting.set` を送る。

afterEach(tearDownWorkflowFace)

type MixedCurrent = {
  readonly steps: readonly string[]
  readonly guard: string
  readonly verify: string
}

const MIXED_BEFORE: MixedCurrent = {
  steps: ["架空:甲", "架空:乙"],
  guard: "alpha",
  verify: "架空の検証",
}

function mixedView(current: MixedCurrent): WorkflowSettingView {
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
        current: current.steps,
      },
      {
        kind: "choice",
        key: "guard",
        label: "架空の選択",
        description: "架空の選択の説明",
        values: [
          { value: "alpha", label: "架空のアルファ", description: "アルファの説明" },
          { value: "beta", label: "架空のベータ", description: "ベータの説明" },
        ],
        current: current.guard,
      },
      {
        kind: "command",
        key: "verify",
        label: "架空のコマンド",
        description: "架空のコマンドの説明",
        current: current.verify,
      },
    ],
  }
}

function renderMixed(onSet?: (command: SentCommand) => unknown): SentCommand[] {
  return renderWorkflowFace(() => rpcOutput(mixedView(MIXED_BEFORE)), onSet)
}

function guardGroup(): HTMLElement {
  return within(dialog()).getByRole("radiogroup", { name: "架空の選択" })
}

function radio(label: string): HTMLInputElement {
  return within(guardGroup()).getByRole<HTMLInputElement>("radio", { name: new RegExp(label, "u") })
}

function commandBox(): HTMLInputElement {
  return within(dialog()).getByRole<HTMLInputElement>("textbox", { name: "架空のコマンド" })
}

function isSaveDisabled(): boolean {
  return bandButton("保存").getAttribute("aria-disabled") === "true"
}

function bandText(): string | null {
  return typedElement(dialog().querySelector("footer"), HTMLElement, "下の帯").textContent
}

describe("設定のダイアログの「ワークフロー」の面（選択とコマンド）", () => {
  it("並び・選択・コマンドの欄を schema の順に出し、選択肢には説明を添える", async () => {
    renderMixed()
    await stepList()

    const labels = Array.from(dialog().querySelectorAll("p, label"))
      .map((element) => element.textContent)
      .filter((text) => ["スキルの並び", "架空の選択", "架空のコマンド"].includes(text ?? ""))
    expect(labels).toEqual(["スキルの並び", "架空の選択", "架空のコマンド"])
    expect(guardGroup().textContent).toContain("アルファの説明")
    expect(guardGroup().textContent).toContain("ベータの説明")
    expect(within(guardGroup()).getAllByRole("radio")).toHaveLength(2)
    expect(radio("架空のアルファ").checked).toBe(true)
    expect(commandBox().value).toBe("架空の検証")
  })

  it("ラジオを替えてもまだ書かず、帯の「保存」が押せるようになる", async () => {
    const sent = renderMixed()
    await stepList()
    expect(isSaveDisabled()).toBe(true)

    fireEvent.click(radio("架空のベータ"))

    expect(radio("架空のベータ").checked).toBe(true)
    expect(isSaveDisabled()).toBe(false)
    expect(setCommands(sent)).toEqual([])
    expect(bandText()).toBe("● 架空の選択を変えたやめる保存")
  })

  it("テキストを替えて保存すると、欄のキーと入力した文字列で1回だけ書き、返った面で描き直す", async () => {
    const sent = renderMixed((): WorkflowSettingChange => ({
      kind: "view",
      view: mixedView({ ...MIXED_BEFORE, verify: "新しい検証" }),
    }))
    await stepList()

    fireEvent.change(commandBox(), { target: { value: "新しい検証" } })
    expect(setCommands(sent)).toEqual([])
    fireEvent.click(bandButton("保存"))

    await waitFor(() => {
      expect(setCommands(sent)).toEqual([
        { procedure: "workflowSetting.set", key: "verify", value: "新しい検証" },
      ])
    })
    await waitFor(() => {
      expect(isSaveDisabled()).toBe(true)
    })
    expect(commandBox().value).toBe("新しい検証")
  })

  it("選択を保存すると、選んだ値をそのまま（JSON にせず）書く", async () => {
    const sent = renderMixed((): WorkflowSettingChange => ({
      kind: "view",
      view: mixedView({ ...MIXED_BEFORE, guard: "beta" }),
    }))
    await stepList()

    fireEvent.click(radio("架空のベータ"))
    fireEvent.click(bandButton("保存"))

    await waitFor(() => {
      expect(setCommands(sent)).toEqual([
        { procedure: "workflowSetting.set", key: "guard", value: "beta" },
      ])
    })
  })

  it("断られたら、その欄の下に理由を出して、選んだラジオと入力した文字を残す", async () => {
    renderMixed((): WorkflowSettingChange => ({
      kind: "failed",
      key: "verify",
      message: "架空の断りの理由",
    }))
    await stepList()

    fireEvent.click(radio("架空のベータ"))
    fireEvent.change(commandBox(), { target: { value: "断られる検証" } })
    fireEvent.click(bandButton("保存"))

    expect(await within(dialog()).findByText("架空の断りの理由")).toBeTruthy()
    expect(radio("架空のベータ").checked).toBe(true)
    expect(commandBox().value).toBe("断られる検証")
    expect(isSaveDisabled()).toBe(false)
  })

  it("「やめる」で今の値に戻り、「保存」がまた押せなくなる", async () => {
    renderMixed()
    await stepList()

    fireEvent.click(radio("架空のベータ"))
    fireEvent.change(commandBox(), { target: { value: "途中の検証" } })
    fireEvent.click(bandButton("やめる"))

    expect(radio("架空のアルファ").checked).toBe(true)
    expect(commandBox().value).toBe("架空の検証")
    expect(isSaveDisabled()).toBe(true)
  })

  it.each([[""], ["   "]])(
    "コマンドを %j にすると「保存」は押せず、「やめる」は押せる",
    async (text) => {
      renderMixed()
      await stepList()

      fireEvent.change(commandBox(), { target: { value: text } })

      expect(isSaveDisabled()).toBe(true)
      expect(bandButton("やめる").getAttribute("aria-disabled")).toBe("false")
      expect(dialog().textContent).toContain("空にして保存はできない")
    },
  )

  it("保存しているあいだは、コマンドの欄に入力できない", async () => {
    renderMixed(() => new Promise<WorkflowSettingChange>(() => undefined))
    await stepList()

    fireEvent.change(commandBox(), { target: { value: "新しい検証" } })
    fireEvent.click(bandButton("保存"))

    await waitFor(() => {
      expect(commandBox().disabled).toBe(true)
    })
  })

  it("並びと選択を両方変えて保存すると、欄ごとに1回ずつ書く", async () => {
    const sent = renderMixed((): WorkflowSettingChange => ({
      kind: "view",
      view: mixedView({ steps: ["架空:甲"], guard: "beta", verify: "架空の検証" }),
    }))
    await stepList()

    fireEvent.click(menuItem("架空の乙", "並びから外す"))
    fireEvent.click(radio("架空のベータ"))
    expect(bandText()).toBe("● 設定を変えたやめる保存")
    fireEvent.click(bandButton("保存"))

    await waitFor(() => {
      expect(setCommands(sent)).toEqual([
        { procedure: "workflowSetting.set", key: "steps", value: JSON.stringify(["架空:甲"]) },
        { procedure: "workflowSetting.set", key: "guard", value: "beta" },
      ])
    })
  })
})
