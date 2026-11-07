import { describe, expect, it } from "vitest"

import {
  isDangerousPermissionMode,
  permissionModeLabel,
} from "../../../../src/browser/features/run-setting/permission-mode-label.ts"
import { PERMISSION_MODES } from "../../../../src/shared/session/run-setting-value.ts"
import {
  foldPermissionMode,
  type ReportedPermissionMode,
} from "../../../../src/shared/session/session-info.ts"

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
