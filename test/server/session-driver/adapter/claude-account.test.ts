import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { readClaudeAccountTier } from "../../../../src/server/session-driver/adapter/claude-account.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const dir = useTempDir("claude-account")

describe("readClaudeAccountTier", () => {
  it("設定ディレクトリの .claude.json から契約の段と枠を読む", () => {
    writeFileSync(
      join(dir(), ".claude.json"),
      JSON.stringify({
        oauthAccount: {
          organizationType: "claude_max",
          organizationRateLimitTier: "default_claude_max_20x",
        },
      }),
    )

    expect(readClaudeAccountTier(dir())).toEqual({
      organizationType: "claude_max",
      rateLimitTier: "default_claude_max_20x",
    })
  })

  it("ファイルが無い・oauthAccount が無いときは両方 undefined", () => {
    const unknown = { organizationType: undefined, rateLimitTier: undefined }

    expect(readClaudeAccountTier(dir())).toEqual(unknown)

    writeFileSync(join(dir(), ".claude.json"), JSON.stringify({ other: 1 }))

    expect(readClaudeAccountTier(dir())).toEqual(unknown)
  })
})
