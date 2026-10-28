import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import { ScreenNav } from "../../../../../src/browser/components/domain/screen-nav/screen-nav.tsx"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session/session-state.ts"
import { typedElement } from "../../../../typed-element.ts"
import { EMPTY_NAV_DRAWER_SLOTS } from "../../../nav-drawer-slot.tsx"
import { queryClientWrapper } from "../../../query-client.tsx"
import { stubRpcFetch, type rpcOutput, type RpcFetchStub } from "../../../rpc-fetch-stub.ts"
import { putSession, type SentCommand } from "../../../session-store.ts"

// 設定のダイアログの「ワークフロー」の面を開くまでの足場。

export const REPOSITORY = {
  worktreeName: "架空の作業ツリー",
  configPath: "/架空/作業ツリー/.tw/config.toml",
}

let rpcStub: RpcFetchStub | undefined

/** `afterEach` で呼ぶ。描いた面を片付け、差し替えた通信を戻す。 */
export function tearDownWorkflowFace(): void {
  cleanup()
  rpcStub?.restore()
  rpcStub = undefined
}

export function renderWorkflowFace(
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

export function dialog(): HTMLElement {
  return screen.getByRole("dialog", { name: "設定" })
}

export function openMenu(title: string): HTMLElement {
  fireEvent.click(within(dialog()).getByRole("button", { name: `${title} の操作` }))
  return within(dialog()).getByRole("menu", { name: `${title} の操作` })
}

export function menuItem(title: string, label: string): HTMLElement {
  return within(openMenu(title)).getByRole("menuitem", { name: label })
}

export function bandButton(name: "保存" | "やめる"): HTMLElement {
  return within(dialog()).getByRole("button", { name })
}

export async function stepList(): Promise<HTMLElement> {
  return within(dialog()).findByRole("list", { name: "スキルの並び" })
}

export function setCommands(sent: readonly SentCommand[]): SentCommand[] {
  return sent.filter((command) => command.procedure === "workflowSetting.set")
}
