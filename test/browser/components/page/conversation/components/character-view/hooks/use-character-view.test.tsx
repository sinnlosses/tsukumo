import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useCharacterView } from "../../../../../../../../src/browser/components/page/conversation/components/character-view/hooks/use-character-view.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../../src/shared/session/session-state.ts"
import { FIXTURE_CHARACTER, speech } from "../../../../../../../fixture/character-view.tsx"
import { queryClientWrapper } from "../../../../../../query-client.tsx"
import { putSession, putState } from "../../../../../../session-store.ts"

afterEach(() => {
  cleanup()
})

describe("useCharacterView", () => {
  it("読む欄が同じで姿の参照だけが新しくなっても描き直さない", () => {
    const base = {
      ...INITIAL_SESSION_STATE,
      character: FIXTURE_CHARACTER,
      speeches: [speech("架空のセリフ")],
    }
    putSession(base)
    let renders = 0
    renderHook(
      () => {
        renders += 1
        return useCharacterView()
      },
      { wrapper: queryClientWrapper() },
    )
    const before = renders

    act(() => {
      putState({ ...base, sessionDefault: { ...base.sessionDefault } })
    })
    act(() => {
      putState({ ...base, sessionDefault: { ...base.sessionDefault } })
    })

    expect(renders).toBe(before)
  })
})
