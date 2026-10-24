import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { ScreenNav } from "../../../../../src/browser/components/domain/screen-nav/screen-nav.tsx"
import { loadLaunchSkill, saveLaunchSkill } from "../../../../../src/browser/domain/launch-skill.ts"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session/session-state.ts"
import { typedElement } from "../../../../typed-element.ts"
import { EMPTY_NAV_DRAWER_SLOTS } from "../../../nav-drawer-slot.tsx"
import { queryClientWrapper } from "../../../query-client.tsx"
import {
  rpcError,
  rpcOutput,
  stubRpcFetch,
  type RpcFetchStub,
  type RpcStubReply,
} from "../../../rpc-fetch-stub.ts"
import { putSession } from "../../../session-store.ts"

// 設定の「タスクの実行」の面。起動するスキルは、ワークフローが返す入口のスキルから選ぶ。

let rpcStub: RpcFetchStub | undefined

beforeEach(() => {
  saveLaunchSkill("")
})

afterEach(() => {
  cleanup()
  rpcStub?.restore()
  rpcStub = undefined
  saveLaunchSkill("")
})

function renderFace(entries: RpcStubReply): HTMLSelectElement {
  rpcStub = stubRpcFetch((call) =>
    call.procedure === "workflowSetting/entries" ? entries : { kind: "pending" },
  )
  putSession(INITIAL_SESSION_STATE, () => undefined)
  render(<ScreenNav drawer={EMPTY_NAV_DRAWER_SLOTS} />, { wrapper: queryClientWrapper() })
  fireEvent.click(
    typedElement(
      document.querySelector(".screen-nav > .screen-nav-settings .screen-nav-settings-toggle"),
      HTMLElement,
      "帯の歯車",
    ),
  )
  const dialog = screen.getByRole("dialog", { name: "設定" })
  fireEvent.click(within(dialog).getByRole("button", { name: "タスクの実行" }))
  return typedElement(
    dialog.querySelector("select[aria-label='起動するスキル']"),
    HTMLSelectElement,
    "起動するスキルの select",
  )
}

function optionTexts(select: HTMLSelectElement): (string | null)[] {
  return [...select.options].map((option) => option.textContent)
}

describe("設定の「起動するスキル」", () => {
  it("未設定と、返された入口のスキルだけを選べ、選ぶと名前を保存する", async () => {
    const select = renderFace(
      rpcOutput([
        { value: "架空の入口", title: "架空の入口の題" },
        { value: "架空の別口", title: "架空の別口の題" },
      ]),
    )

    await waitFor(() => {
      expect(optionTexts(select)).toEqual(["未設定", "架空の入口の題", "架空の別口の題"])
    })
    fireEvent.change(select, { target: { value: "架空の別口" } })

    expect(loadLaunchSkill()).toBe("架空の別口")
  })

  it("保存済みの名前が候補に無ければ、（一覧に無い）を添えて残す", async () => {
    saveLaunchSkill("消えた名前")
    const select = renderFace(rpcOutput([{ value: "架空の入口", title: "架空の入口の題" }]))

    await waitFor(() => {
      expect(optionTexts(select)).toEqual(["未設定", "架空の入口の題", "消えた名前（一覧に無い）"])
    })
    expect(select.value).toBe("消えた名前")
    expect(loadLaunchSkill()).toBe("消えた名前")
  })

  it("候補が空・読めないときは未設定だけで、保存済みの名前は残る", async () => {
    saveLaunchSkill("消えた名前")
    const select = renderFace(rpcError(500))

    await waitFor(() => {
      expect(optionTexts(select)).toEqual(["未設定", "消えた名前（一覧に無い）"])
    })
    expect(loadLaunchSkill()).toBe("消えた名前")
  })

  it("候補が空で未設定なら、未設定だけ", async () => {
    const select = renderFace(rpcOutput([]))

    await waitFor(() => {
      expect(rpcStub?.calls().some((call) => call.procedure === "workflowSetting/entries")).toBe(
        true,
      )
    })
    expect(optionTexts(select)).toEqual(["未設定"])
  })
})
