import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ScreenNav } from "../../../../../src/browser/components/domain/screen-nav/screen-nav.tsx"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session/session-state.ts"
import { typedElement } from "../../../../typed-element.ts"
import { MARKED_NAV_DRAWER_SLOTS } from "../../../nav-drawer-slot.tsx"
import { queryClientWrapper } from "../../../query-client.tsx"
import { putSession } from "../../../session-store.ts"

afterEach(() => {
  cleanup()
  window.location.hash = ""
})

describe("ScreenNav の選択中の値", () => {
  // 会話の画面の帯にはドロップダウンが無いので、ほかの画面で見る。
  it("状態の model / permissionMode の値を選択する", () => {
    window.location.hash = "#character"
    putSession(
      {
        ...INITIAL_SESSION_STATE,
        model: "claude-sonnet-5",
        modelEffortSupport: [
          {
            model: "sonnet",
            resolvedModel: "claude-sonnet-5",
            supportsEffort: true,
            effortLevels: ["low"],
          },
        ],
        session: { kind: "running", sessionId: "s-fixture", permissionMode: "plan" },
      },
      () => {},
    )
    render(<ScreenNav drawer={MARKED_NAV_DRAWER_SLOTS} />, { wrapper: queryClientWrapper() })

    expect(
      typedElement(screen.getByLabelText("モデル"), HTMLSelectElement, "モデルの<select>").value,
    ).toBe("sonnet")
    expect(
      typedElement(screen.getByLabelText("許可モード"), HTMLSelectElement, "許可モードの<select>")
        .value,
    ).toBe("plan")
  })

  it("知らない許可モードは既定の字に倒さず、届いた語を選択する", () => {
    window.location.hash = "#character"
    putSession(
      {
        ...INITIAL_SESSION_STATE,
        session: {
          kind: "running",
          sessionId: "s-fixture",
          permissionMode: { kind: "unknown", raw: "dontAsk" },
        },
      },
      () => {},
    )
    render(<ScreenNav drawer={MARKED_NAV_DRAWER_SLOTS} />, { wrapper: queryClientWrapper() })

    const select = typedElement(
      screen.getByLabelText("許可モード"),
      HTMLSelectElement,
      "許可モードの<select>",
    )
    expect(select.value).toBe("dontAsk")
    expect(select.selectedOptions[0]?.textContent).toBe("dontAsk")
  })
})
