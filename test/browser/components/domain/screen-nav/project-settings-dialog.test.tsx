import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ProjectSettingsDialog } from "../../../../../src/browser/components/domain/screen-nav/components/project-settings-dialog.tsx"
import type { ProjectSettingsDraft } from "../../../../../src/shared/repository/project-settings.ts"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session/session-state.ts"
import { createTestQueryClient } from "../../../query-client.tsx"
import { rpcOutput, stubRpcFetch, type RpcFetchStub } from "../../../rpc-fetch-stub.ts"
import { putSession, type SentCommand } from "../../../session-store.ts"

let fetchStub: RpcFetchStub | undefined = undefined

afterEach(() => {
  cleanup()
  fetchStub?.restore()
  fetchStub = undefined
})

function draft(file: ProjectSettingsDraft["file"]): ProjectSettingsDraft {
  return {
    file,
    mainBranch: { value: "main", inferred: true },
    runPrompt: { value: "タスク {id} を進めて（架空の文面）。", inferred: false },
  }
}

/** 開いたダイアログを描き、送ったコマンドを溜める先を返す。 */
function renderDialog(file: ProjectSettingsDraft["file"]): readonly SentCommand[] {
  const sent: SentCommand[] = []
  fetchStub = stubRpcFetch(() => rpcOutput(draft(file)))
  putSession(INITIAL_SESSION_STATE, (command) => sent.push(command))
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ProjectSettingsDialog open onClose={() => {}} />
    </QueryClientProvider>,
  )
  return sent
}

async function field(label: string): Promise<HTMLInputElement | HTMLTextAreaElement> {
  const found = await screen.findByLabelText(label)
  if (!(found instanceof HTMLInputElement || found instanceof HTMLTextAreaElement)) {
    throw new Error(`${label} の欄が無い`)
  }
  return found
}

describe("ProjectSettingsDialog", () => {
  it("開くと、取り直した下書きの値が欄に並ぶ", async () => {
    renderDialog("none")

    expect((await field("主ブランチ")).value).toBe("main")
    expect((await field("頼む文面")).value).toBe("タスク {id} を進めて（架空の文面）。")
  })

  it("設定が読めないと、保存の前に上書きを確かめ、「上書き」で初めて送る", async () => {
    const sent = renderDialog("invalid")
    await field("主ブランチ")

    fireEvent.click(screen.getByRole("button", { name: "保存" }))
    const confirm = screen.getByRole("group", { name: "上書きする？" })
    expect(sent).toEqual([])

    fireEvent.click(within(confirm).getByRole("button", { name: "上書き" }))
    expect(sent).toEqual([
      {
        procedure: "projectSettings.save",
        mainBranch: "main",
        runPrompt: "タスク {id} を進めて（架空の文面）。",
      },
    ])
  })
})
