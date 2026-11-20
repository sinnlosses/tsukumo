import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ScreenNav } from "../../../../../src/browser/components/frame/screen-nav/screen-nav.tsx"
import { BUILTIN_GEAR_PREFERENCES } from "../../../../../src/shared/session/gear-preference.ts"
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
import { putSession, type SentCommand } from "../../../session-store.ts"

// 設定の「タスクの実行」の面。起動するスキルは、ワークフローが返す入口のスキルから選ぶ。

let rpcStub: RpcFetchStub | undefined

afterEach(() => {
  cleanup()
  rpcStub?.restore()
  rpcStub = undefined
})

function renderFace(
  entries: RpcStubReply,
  launchSkill = "",
  sent: SentCommand[] = [],
): HTMLSelectElement {
  rpcStub = stubRpcFetch((call) =>
    call.procedure === "workflowSetting/entries" ? entries : { kind: "pending" },
  )
  putSession(
    { ...INITIAL_SESSION_STATE, gearPreferences: { ...BUILTIN_GEAR_PREFERENCES, launchSkill } },
    (command) => {
      sent.push(command)
    },
  )
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
  it("未設定と、返された入口のスキルだけを選べ、選ぶと名前を覚えさせる", async () => {
    const sent: SentCommand[] = []
    const select = renderFace(
      rpcOutput([
        { value: "架空の入口", title: "架空の入口の題" },
        { value: "架空の別口", title: "架空の別口の題" },
      ]),
      "",
      sent,
    )

    await waitFor(() => {
      expect(optionTexts(select)).toEqual(["未設定", "架空の入口の題", "架空の別口の題"])
    })
    fireEvent.change(select, { target: { value: "架空の別口" } })

    expect(sent).toEqual([
      { procedure: "session.setGearPreference", field: "launchSkill", value: "架空の別口" },
    ])
  })

  it("覚えた名前が候補に無ければ、（一覧に無い）を添えて残す", async () => {
    const sent: SentCommand[] = []
    const select = renderFace(
      rpcOutput([{ value: "架空の入口", title: "架空の入口の題" }]),
      "消えた名前",
      sent,
    )

    await waitFor(() => {
      expect(optionTexts(select)).toEqual(["未設定", "架空の入口の題", "消えた名前（一覧に無い）"])
    })
    expect(select.value).toBe("消えた名前")
    expect(sent).toEqual([])
  })

  it("候補が空・読めないときは未設定だけで、覚えた名前は残る", async () => {
    const sent: SentCommand[] = []
    const select = renderFace(rpcError(500), "消えた名前", sent)

    await waitFor(() => {
      expect(optionTexts(select)).toEqual(["未設定", "消えた名前（一覧に無い）"])
    })
    expect(sent).toEqual([])
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
