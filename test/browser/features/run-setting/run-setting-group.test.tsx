import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { RunSettingGroup } from "../../../../src/browser/features/run-setting/run-setting-group.tsx"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import { checkedSessionId } from "../../../fixture/session-id.ts"
import { typedElement } from "../../../typed-element.ts"
import { putSession, putState, type SentCommand } from "../../session-store.ts"

afterEach(() => {
  cleanup()
})

const OPUS_SUPPORT = {
  model: "opus",
  resolvedModel: "claude-opus-5",
  supportsEffort: true,
  effortLevels: ["low", "medium", "high", "xhigh", "max"],
} as const

const KNOWN_STATE = {
  ...INITIAL_SESSION_STATE,
  model: "claude-opus-5",
  modelEffortSupport: [OPUS_SUPPORT],
  effort: "high",
} satisfies typeof INITIAL_SESSION_STATE

function renderGroup(state: typeof INITIAL_SESSION_STATE = KNOWN_STATE): readonly SentCommand[] {
  const sent: SentCommand[] = []
  putSession(state, (command) => {
    sent.push(command)
  })
  render(<RunSettingGroup />)
  return sent
}

function selectOf(label: RegExp): HTMLSelectElement {
  return typedElement(
    screen.getByRole("combobox", { name: label }),
    HTMLSelectElement,
    "札の <select>",
  )
}

describe("RunSettingGroup（入力欄の下の行の札）", () => {
  it("モデル・effort・許可モードの3つの札を出す", () => {
    renderGroup()

    expect(screen.getAllByRole("combobox")).toHaveLength(3)
    expect(selectOf(/^モデル /)).toBeTruthy()
    expect(selectOf(/^effort /)).toBeTruthy()
    expect(selectOf(/^許可モード /)).toBeTruthy()
  })

  it("選ぶと対応する手続きが1回ずつ送られる", () => {
    const sent = renderGroup()

    fireEvent.change(selectOf(/^モデル /), { target: { value: "sonnet" } })
    fireEvent.change(selectOf(/^effort /), { target: { value: "max" } })
    fireEvent.change(selectOf(/^許可モード /), { target: { value: "plan" } })

    expect(sent).toEqual([
      { procedure: "session.setModel", model: "sonnet" },
      { procedure: "session.setEffort", effort: "max" },
      { procedure: "session.setPermissionMode", mode: "plan" },
    ])
  })

  it("選んだだけでは値が変わらず、サーバから届いた値で変わる", () => {
    renderGroup()

    fireEvent.change(selectOf(/^effort /), { target: { value: "max" } })
    expect(selectOf(/^effort /).value).toBe("high")

    act(() => {
      putState({ ...KNOWN_STATE, effort: "max" })
    })
    expect(selectOf(/^effort /).value).toBe("max")
  })

  it("effort の段が分からないあいだは effort の札を出さない", () => {
    renderGroup({ ...INITIAL_SESSION_STATE, model: "claude-opus-5" })

    expect(screen.queryByRole("combobox", { name: /^effort / })).toBeNull()
    expect(screen.getAllByRole("combobox")).toHaveLength(2)
  })

  it("知らないモデルと許可モードは届いた語のまま出す", () => {
    renderGroup({
      ...KNOWN_STATE,
      model: "claude-opus-4-8",
      session: {
        kind: "running",
        sessionId: checkedSessionId("s-fixture"),
        permissionMode: { kind: "unknown", raw: "dontAsk" },
      },
    })

    expect(screen.getByRole("combobox", { name: "モデル claude-opus-4-8" })).toBeTruthy()
    expect(screen.getByRole("combobox", { name: "許可モード dontAsk" })).toBeTruthy()
    expect(selectOf(/^許可モード /).value).toBe("dontAsk")
  })

  it("全部許すのときだけ許可モードの札が警告の形になる", () => {
    renderGroup({
      ...KNOWN_STATE,
      session: {
        kind: "running",
        sessionId: checkedSessionId("s-fixture"),
        permissionMode: "bypassPermissions",
      },
    })

    expect(selectOf(/^許可モード /).classList.contains("is-danger")).toBe(true)
    expect(selectOf(/^モデル /).classList.contains("is-danger")).toBe(false)
  })
})
