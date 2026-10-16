import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { workflowPluginDir } from "../../src/server/session-driver/adapter/workflow-plugin.ts"
import { chooseTw } from "../../src/wiring/workflow-setting.ts"

describe("chooseTw", () => {
  it("差し替えが無く取り込みを載せるときは、取り込みの bin/tw", () => {
    expect(chooseTw(undefined, true)).toBe(join(workflowPluginDir(), "bin", "tw"))
  })

  it("差し替えが無く取り込みを載せないときは、PATH の tw", () => {
    expect(chooseTw(undefined, false)).toBe("tw")
  })

  it("差し替えがあれば、取り込みを載せるときもそのパス", () => {
    expect(chooseTw("/somewhere/fake-tw", true)).toBe("/somewhere/fake-tw")
  })

  it("差し替えがあれば、取り込みを載せないときもそのパス", () => {
    expect(chooseTw("/somewhere/fake-tw", false)).toBe("/somewhere/fake-tw")
  })
})
