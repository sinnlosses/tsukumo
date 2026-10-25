import { describe, expect, test } from "vitest"

import { replayEnvironment } from "../../../scripts/shared/claude-environment.ts"

describe("replayEnvironment", () => {
  test("今のセッションの目印を落とし、ほかの変数は残す", () => {
    expect(
      replayEnvironment({
        PATH: "/usr/bin",
        HOME: "/home/a",
        CLAUDECODE: "1",
        CLAUDE_CODE_SESSION_ID: "x",
        CLAUDE_AGENT_SDK_VERSION: "1",
        ORCA_AGENT_HOOK_TOKEN: "secret",
        UNSET: undefined,
      }),
    ).toEqual({ PATH: "/usr/bin", HOME: "/home/a" })
  })
})
