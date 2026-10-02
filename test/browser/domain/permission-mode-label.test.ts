import { describe, expect, it } from "vitest"

import {
  isDangerousPermissionMode,
  permissionModeShieldFill,
  resolvePermissionMode,
} from "../../../src/browser/domain/permission-mode-label.ts"
import { PERMISSION_MODES } from "../../../src/shared/command.ts"

describe("isDangerousPermissionMode", () => {
  it.each(PERMISSION_MODES.map((mode) => [mode, mode === "bypassPermissions"] as const))(
    "%s は %s",
    (mode, expected) => {
      expect(isDangerousPermissionMode(mode)).toBe(expected)
    },
  )
})

describe("resolvePermissionMode", () => {
  it.each([
    [undefined, "auto"],
    ["no-such-mode", "auto"],
    ["plan", "plan"],
    ["bypassPermissions", "bypassPermissions"],
  ])("%s は %s", (mode, expected) => {
    expect(resolvePermissionMode(mode)).toBe(expected)
  })
})

describe("permissionModeShieldFill", () => {
  it.each(PERMISSION_MODES)("%s に塗り区分がある", (mode) => {
    expect(["empty", "dashed", "filled"]).toContain(permissionModeShieldFill(mode))
  })

  it("全部許すは塗り", () => {
    expect(permissionModeShieldFill("bypassPermissions")).toBe("filled")
  })
})
