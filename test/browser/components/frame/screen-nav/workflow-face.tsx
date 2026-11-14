import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import { SettingsScreen } from "../../../../../src/browser/components/frame/screen-nav/settings-screen.tsx"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session/session-state.ts"
import { queryClientWrapper } from "../../../query-client.tsx"
import { stubRpcFetch, type rpcOutput, type RpcFetchStub } from "../../../rpc-fetch-stub.ts"
import { putSession, type SentCommand } from "../../../session-store.ts"

// 設定の紙の「ワークフロー」の面を描くまでの足場。

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
  // 紙はほかの手続き（起動するスキルの候補など）も引くので、この面の読み取りにだけ `read` を返す。
  rpcStub = stubRpcFetch((call) =>
    call.procedure === "workflowSetting/read" ? read() : { kind: "pending" },
  )
  putSession(INITIAL_SESSION_STATE, (command) => {
    sent.push(command)
    return onSet(command)
  })
  render(<SettingsScreen />, { wrapper: queryClientWrapper() })
  return sent
}

/** ワークフローの面を置く「このプロジェクト」の群。 */
export function workflowGroup(): HTMLElement {
  return screen.getByRole("region", { name: "このプロジェクト" })
}

export function openMenu(title: string): HTMLElement {
  fireEvent.click(within(workflowGroup()).getByRole("button", { name: `${title} の操作` }))
  return within(workflowGroup()).getByRole("menu", { name: `${title} の操作` })
}

export function menuItem(title: string, label: string): HTMLElement {
  return within(openMenu(title)).getByRole("menuitem", { name: label })
}

export function bandButton(name: "保存" | "やめる"): HTMLElement {
  return within(workflowGroup()).getByRole("button", { name })
}

export async function stepList(): Promise<HTMLElement> {
  return within(workflowGroup()).findByRole("list", { name: "スキルの並び" })
}

export function setCommands(sent: readonly SentCommand[]): SentCommand[] {
  return sent.filter((command) => command.procedure === "workflowSetting.set")
}
