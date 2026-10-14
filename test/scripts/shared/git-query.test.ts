import { describe, expect, test } from "vitest"

import { queryGit } from "../../../scripts/shared/git-query.ts"
import { runSubprocess } from "../../fixture/subprocess.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

const tempDir = useTempDir("git-query")

describe("git の問い合わせ", () => {
  test("成功すると stdout をそのまま返す", async () => {
    await runSubprocess("git", ["init", "--quiet"], { cwd: tempDir() })

    expect(queryGit(tempDir(), ["rev-parse", "--is-inside-work-tree"])).toBe("true\n")
  })

  test("失敗は undefined に畳む", () => {
    expect(queryGit(tempDir(), ["rev-parse", "--git-dir"])).toBeUndefined()
  })
})
