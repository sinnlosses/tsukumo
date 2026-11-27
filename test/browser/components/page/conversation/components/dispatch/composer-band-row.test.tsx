import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Composer } from "../../../../../../../src/browser/components/page/conversation/components/dispatch/composer.tsx"
import type { StampedPendingAsk } from "../../../../../../../src/shared/session-driver/pending-ask.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { createTestQueryClient } from "../../../../../query-client.tsx"
import { putSession } from "../../../../../session-store.ts"

const PERMISSION_PENDING = {
  kind: "permission",
  id: "ask-1",
  toolName: "Bash",
  input: {},
  askedAt: 0,
} satisfies StampedPendingAsk

const SKIPPED_NOTICE = /プロジェクトの設定.*を読まずに起動しました/

afterEach(() => {
  cleanup()
})

function renderComposer(
  projectSettingsSkipped: boolean,
  pending: readonly StampedPendingAsk[] = [],
): void {
  putSession({ ...INITIAL_SESSION_STATE, projectSettingsSkipped, pending })
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <Composer />
    </QueryClientProvider>,
  )
}

describe("プロジェクトの設定を読まなかった知らせの帯", () => {
  it("読まなかった設定と、読み込ませるための手順を出す", () => {
    renderComposer(true)

    const notice = screen.getByText(SKIPPED_NOTICE).textContent

    expect(notice).toContain(".claude/ の settings.json・settings.local.json のフックと許可の規則")
    expect(notice).toContain("CLAUDE.md、スキル・サブエージェント・コマンド")
    expect(notice).toContain("claude を起動して信頼すると答えてから「新規」で始め直して")
  })

  it("信頼しているフォルダで起きた代では出さない", () => {
    renderComposer(false)

    expect(screen.queryByText(SKIPPED_NOTICE)).toBeNull()
  })

  it("お伺いがあるあいだは、お伺いの帯に譲る", () => {
    renderComposer(true, [PERMISSION_PENDING])

    expect(screen.queryByText(SKIPPED_NOTICE)).toBeNull()
    expect(screen.getByRole("button", { name: "選択肢へ" })).toBeDefined()
  })
})
