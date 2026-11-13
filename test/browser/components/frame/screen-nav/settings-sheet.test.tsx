import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  FACES,
  SETTINGS_GROUPS,
} from "../../../../../src/browser/components/frame/screen-nav/components/screen-nav-settings-face.tsx"
import { SettingsScreen } from "../../../../../src/browser/components/frame/screen-nav/settings-screen.tsx"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session/session-state.ts"
import { queryClientWrapper } from "../../../query-client.tsx"
import { rpcOutput, stubRpcFetch, type RpcFetchStub } from "../../../rpc-fetch-stub.ts"
import { putSession } from "../../../session-store.ts"
import { REPOSITORY } from "./workflow-face.tsx"

// 設定の紙（`#settings`）。群の見出しの下に、今の設定の項目を1列で並べる。

let rpcStub: RpcFetchStub | undefined

beforeEach(() => {
  rpcStub = stubRpcFetch((call) =>
    call.procedure === "workflowSetting/read"
      ? rpcOutput({
          kind: "available",
          repository: REPOSITORY,
          fields: [
            {
              kind: "steps",
              key: "steps",
              label: "スキルの並び",
              description: "架空の並びの説明",
              values: [{ value: "架空:甲", label: "甲", title: "架空の甲", description: "" }],
              current: ["架空:甲"],
            },
          ],
        })
      : { kind: "pending" },
  )
  putSession(INITIAL_SESSION_STATE)
})

afterEach(() => {
  cleanup()
  rpcStub?.restore()
  rpcStub = undefined
})

function renderSheet(): void {
  render(<SettingsScreen />, { wrapper: queryClientWrapper() })
}

describe("設定の紙", () => {
  it("群の表に、設定の面の5つがちょうど1回ずつ出る", () => {
    const grouped: readonly string[] = SETTINGS_GROUPS.flatMap((group) => group.keys)

    expect(grouped.toSorted()).toEqual(FACES.map((face) => face.key).toSorted())
  })

  it("3つの群の見出しが見本の順に出る", () => {
    renderSheet()

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(["動き方", "見た目", "このプロジェクト"])
  })

  it("今の設定の項目が全部出る", async () => {
    renderSheet()

    for (const name of [
      "会話の画面の器",
      "新しいセッションの既定のモデル",
      "新しいセッションの既定の effort",
      "新しいセッションの既定の許可モード",
      "新しいセッションの図の既定",
      "書き上げる演出の速さ",
      "起動するスキル",
    ]) {
      expect(screen.getByLabelText(name), name).toBeDefined()
    }
    for (const label of ["地の色", "領域の色", "字の色"]) {
      expect(screen.getByLabelText(label), label).toBeDefined()
    }
    expect(await screen.findByRole("list", { name: "スキルの並び" })).toBeDefined()
  })

  it("既定に戻すが1つだけある", () => {
    renderSheet()

    expect(screen.getAllByRole("button", { name: "既定に戻す" })).toHaveLength(1)
    expect(within(document.body).queryByRole("dialog")).toBeNull()
  })
})
