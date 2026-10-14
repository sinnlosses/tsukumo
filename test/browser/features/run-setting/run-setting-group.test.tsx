import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RunSettingGroup } from "../../../../src/browser/features/run-setting/components/run-setting-group.tsx"
import { nowEpochMilliseconds } from "../../../../src/browser/utils/clock.ts"
import {
  INITIAL_SESSION_STATE,
  type SettingMark,
  type SettingMarks,
} from "../../../../src/shared/session/session-state.ts"
import { putSession, putState } from "../../session-store.ts"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
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

const NO_MARK = { kind: "none" } satisfies SettingMark
const NO_ORIGIN = { kind: "unknown" } as const

function marksWith(patch: Partial<SettingMarks>): SettingMarks {
  return { model: NO_MARK, effort: NO_MARK, permissionMode: NO_MARK, ...patch }
}

function stateWithMarks(settingMarks: SettingMarks): typeof INITIAL_SESSION_STATE {
  return { ...INITIAL_SESSION_STATE, model: "claude-opus-5", effort: "high", settingMarks }
}

function dotOf(label: RegExp): string | undefined {
  const select = screen.getByRole("combobox", { name: label })
  return select.parentElement?.querySelector("[data-dot]")?.getAttribute("data-dot") ?? undefined
}

describe("RunSettingGroup（口の右肩の点）", () => {
  it("印が無ければ点を出さない", () => {
    putSession(stateWithMarks(marksWith({})))
    render(<RunSettingGroup placement="sidebar-footer" />)

    expect([dotOf(/^モデル /), dotOf(/^effort /), dotOf(/^許可モード /)]).toEqual([
      undefined,
      undefined,
      undefined,
    ])
  })

  it("受け付けた印はその口にだけ空洞の点を出し、title が「受け付けた」と言う（モデル・effort・許可モードとも）", () => {
    const at = nowEpochMilliseconds()
    for (const setting of ["model", "effort", "permissionMode"] as const) {
      cleanup()
      putSession(
        stateWithMarks(
          marksWith({ [setting]: { kind: "accepted", value: "x", at, from: NO_ORIGIN } }),
        ),
      )
      render(<RunSettingGroup placement="sidebar-footer" />)

      const dots = {
        model: dotOf(/^モデル /),
        effort: dotOf(/^effort /),
        permissionMode: dotOf(/^許可モード /),
      }
      expect(dots).toEqual({
        model: undefined,
        effort: undefined,
        permissionMode: undefined,
        [setting]: "accepted",
      })
      const label = { model: /^モデル /, effort: /^effort /, permissionMode: /^許可モード / }[
        setting
      ]
      expect(screen.getByRole("combobox", { name: label }).title).toMatch(/・ 受け付けた$/)
    }
  })

  it("見届けた印は塗りの点を出し、title が「効いた」と言う", () => {
    putSession(
      stateWithMarks(
        marksWith({ model: { kind: "confirmed", value: "opus", at: nowEpochMilliseconds() } }),
      ),
    )
    render(<RunSettingGroup placement="sidebar-footer" />)

    expect(dotOf(/^モデル /)).toBe("confirmed")
    expect(screen.getByRole("combobox", { name: /^モデル / }).title).toMatch(/・ 効いた$/)
  })

  it("見届けた点は3秒で消え、空洞の点は見届けるまで残る", () => {
    vi.useFakeTimers()
    const at = nowEpochMilliseconds()
    putSession(
      stateWithMarks(
        marksWith({
          model: { kind: "confirmed", value: "opus", at },
          effort: { kind: "accepted", value: "high", at, from: NO_ORIGIN },
        }),
      ),
    )
    render(<RunSettingGroup placement="sidebar-footer" />)

    act(() => {
      vi.advanceTimersByTime(3100)
    })
    expect([dotOf(/^モデル /), dotOf(/^effort /)]).toEqual([undefined, "accepted"])

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(dotOf(/^effort /)).toBe("accepted")
  })

  it("空洞の点が見届けられて塗りになり、消えたあとに別の時刻で付け直された印は、また点を出す", () => {
    vi.useFakeTimers()
    const at = nowEpochMilliseconds()
    putSession(
      stateWithMarks(
        marksWith({ model: { kind: "accepted", value: "opus", at, from: NO_ORIGIN } }),
      ),
    )
    render(<RunSettingGroup placement="sidebar-footer" />)

    act(() => {
      putState(stateWithMarks(marksWith({ model: { kind: "confirmed", value: "opus", at } })))
    })
    expect(dotOf(/^モデル /)).toBe("confirmed")
    act(() => {
      vi.advanceTimersByTime(3100)
    })
    expect(dotOf(/^モデル /)).toBeUndefined()

    act(() => {
      putState(
        stateWithMarks(
          marksWith({
            model: { kind: "accepted", value: "sonnet", at: at + 3100, from: NO_ORIGIN },
          }),
        ),
      )
    })

    expect(dotOf(/^モデル /)).toBe("accepted")
  })

  it("開いた時点で寿命を過ぎている見届けた印は点を出さない", () => {
    const old = nowEpochMilliseconds() - 60_000
    putSession(
      stateWithMarks(marksWith({ permissionMode: { kind: "confirmed", value: "plan", at: old } })),
    )
    render(<RunSettingGroup placement="sidebar-footer" />)

    expect(dotOf(/^許可モード /)).toBeUndefined()
  })
})
