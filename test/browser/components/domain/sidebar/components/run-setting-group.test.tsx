import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { RunSettingGroup } from "../../../../../../src/browser/components/domain/sidebar/components/run-setting-group.tsx"
import { INITIAL_SESSION_STATE } from "../../../../../../src/shared/session/session-state.ts"
import { putSession } from "../../../../session-store.ts"

afterEach(() => {
  cleanup()
})

const OPUS_SUPPORT = {
  model: "opus",
  supportsEffort: true,
  effortLevels: ["low", "medium", "high", "xhigh", "max"],
} as const

function renderGroup(): void {
  putSession({
    ...INITIAL_SESSION_STATE,
    model: "claude-opus-5",
    modelEffortSupport: [OPUS_SUPPORT],
    effort: "high",
  })
  render(<RunSettingGroup placement="sidebar-footer" />)
}

function optionsOf(label: RegExp): readonly HTMLOptionElement[] {
  const select = screen.getByRole("combobox", { name: label })
  return [...select.querySelectorAll("option")]
}

describe("RunSettingGroup（吊り札の行）", () => {
  it("effort の行は、いまの段までの棒だけが灯る", () => {
    renderGroup()

    expect(
      optionsOf(/^effort /).map((option) => [
        option.value,
        option.querySelector(".run-setting-effort-bar-row")?.classList.contains("is-lit"),
      ]),
    ).toEqual([
      ["low", true],
      ["medium", true],
      ["high", true],
      ["xhigh", false],
      ["max", false],
    ])
  })

  it("許可モードの行は、盾の塗りで段を見せる", () => {
    renderGroup()

    expect(
      optionsOf(/^許可モード /).map((option) => [
        option.value,
        option.querySelector("[data-fill]")?.getAttribute("data-fill"),
      ]),
    ).toEqual([
      ["default", "empty"],
      ["acceptEdits", "dashed"],
      ["auto", "dashed"],
      ["plan", "dashed"],
      ["bypassPermissions", "filled"],
    ])
  })
})
