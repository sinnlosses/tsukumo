import { fireEvent, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { rpcOutput } from "../../../rpc-fetch-stub.ts"
import { dialog, renderWorkflowFace, REPOSITORY, tearDownWorkflowFace } from "./workflow-face.tsx"

// 設定のダイアログの「あなた」と「このリポジトリ」の群分けと、各ページの範囲の札・保存先。

afterEach(tearDownWorkflowFace)

function show(name: string): string {
  fireEvent.click(within(dialog()).getByRole("button", { name }))
  return within(dialog()).getByRole("region").textContent ?? ""
}

describe("設定のダイアログの範囲の群分け", () => {
  it("ナビは「あなた」と「このリポジトリ」の2群で、ワークフローだけが後者に並ぶ", () => {
    renderWorkflowFace(() =>
      rpcOutput({ kind: "unavailable", repository: REPOSITORY, reason: "tw-missing", detail: "" }),
    )
    const nav = within(dialog()).getByRole("navigation", { name: "設定の項目" })

    const lines = [...nav.children].slice(1).map((node) => node.textContent?.replace(/\d+$/, ""))

    expect(lines.slice(0, 5)).toEqual([
      "あなた全リポジトリ",
      "見た目",
      "新しいセッション",
      "演出",
      "タスクの実行",
    ])
    expect(lines[5]).toMatch(/^このリポジトリ/)
    expect(lines.slice(6)).toEqual(["ワークフロー", "", "初回の説明をもう一度出す"])
  })

  it("「このリポジトリ」の見出しの右にリポジトリの名前を出す", async () => {
    renderWorkflowFace(() =>
      rpcOutput({ kind: "unavailable", repository: REPOSITORY, reason: "tw-missing", detail: "" }),
    )
    const nav = within(dialog()).getByRole("navigation", { name: "設定の項目" })

    expect(await within(nav).findByText("架空の作業ツリー")).toBeInstanceOf(HTMLElement)
  })

  it("どのページも面の名前の下に範囲の札と保存先を出す", () => {
    renderWorkflowFace(() => ({ kind: "pending" }))

    for (const name of ["見た目", "新しいセッション", "演出", "タスクの実行"]) {
      expect(show(name)).toContain(`${name}あなた保存先 ~/.tsukumo/state.json`)
    }
    expect(show("ワークフロー")).toContain("ワークフローこのリポジトリ保存先 .tw/config.toml")
  })
})
