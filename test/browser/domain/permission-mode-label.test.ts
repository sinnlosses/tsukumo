import { describe, expect, it } from "vitest"

import {
  isDangerousPermissionMode,
  permissionModeChoices,
  permissionModeLabel,
} from "../../../src/browser/domain/permission-mode-label.ts"
import { PERMISSION_MODES } from "../../../src/shared/command.ts"
import {
  foldPermissionMode,
  type ReportedPermissionMode,
} from "../../../src/shared/session/session-info.ts"

describe("isDangerousPermissionMode", () => {
  it.each(PERMISSION_MODES.map((mode) => [mode, mode === "bypassPermissions"] as const))(
    "%s は %s",
    (mode, expected) => {
      expect(isDangerousPermissionMode(mode)).toBe(expected)
    },
  )

  it("知らない許可モードは危険扱いにしない", () => {
    expect(isDangerousPermissionMode({ kind: "unknown", raw: "no-such-mode" })).toBe(false)
  })
})

describe("foldPermissionMode", () => {
  it.each([
    ["plan", "plan"],
    ["no-such-mode", { kind: "unknown", raw: "no-such-mode" }],
  ] satisfies readonly (readonly [string, ReportedPermissionMode])[])(
    "%s を畳む",
    (raw, expected) => {
      expect(foldPermissionMode(raw)).toEqual(expected)
    },
  )
})

describe("permissionModeLabel", () => {
  it("知っている許可モードは日本語の字、知らない語は届いた語のまま出す（既定の字に倒さない）", () => {
    expect(permissionModeLabel("plan")).toBe("プラン")
    expect(permissionModeLabel({ kind: "unknown", raw: "dontAsk" })).toBe("dontAsk")
  })
})

describe("permissionModeChoices", () => {
  it("知らない語が届いたときだけ、その語の行を末尾に足す", () => {
    const known = permissionModeChoices("auto")
    const withUnknown = permissionModeChoices({ kind: "unknown", raw: "dontAsk" })

    expect(known).toHaveLength(PERMISSION_MODES.length)
    expect(withUnknown).toEqual([...known, { value: "dontAsk", label: "dontAsk" }])
  })
})
