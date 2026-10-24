import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  findEnvironmentVariableMismatches,
  formatEnvironmentVariableMismatch,
} from "../../../../scripts/document/environment-variable.ts"
import { collectDocumentedEnvironmentVariables } from "../../../../scripts/document/lib/environment-variable-repository.ts"
import { REPOSITORY_ROOT } from "../../../../scripts/shared/repository-root.ts"
import { ENV_NAMES } from "../../../../src/server/core/config.ts"

// サーバが読む環境変数の名前の表（`ENV_NAMES`）と `docs/readme/configuration.md` の「環境変数」節が、
// `audience: "user"` は文書に載る・文書の名前は表にある、の双方向で一致することを保つ。

// サーバの外（scripts・vitest の設定）が読む名前。読む場所のソースに実在することも見る。
const READ_OUTSIDE_SERVER = [
  { name: "TSUKUMO_CHECK_WORKER_BUDGET", reader: "scripts/dev/check.ts" },
  { name: "TSUKUMO_HOOK_DENIAL_RECORD", reader: "scripts/hook/lib/hook-denial-record.ts" },
] as const

describe("環境変数の名前", () => {
  const documented = collectDocumentedEnvironmentVariables(REPOSITORY_ROOT)

  it("ENV_NAMES と configuration.md が双方向に一致する", () => {
    expect(
      findEnvironmentVariableMismatches({
        documented,
        entries: Object.values(ENV_NAMES),
        allowedExtra: READ_OUTSIDE_SERVER.map((item) => item.name),
      }).map(formatEnvironmentVariableMismatch),
    ).toEqual([])
  })

  it("サーバの外が読む名前の例外は、文書にも読む場所のソースにも実在する", () => {
    const documentedNames = documented.map((item) => item.name)
    for (const { name, reader } of READ_OUTSIDE_SERVER) {
      expect(documentedNames).toContain(name)
      expect(readFileSync(join(REPOSITORY_ROOT, reader), "utf8")).toContain(name)
    }
  })
})
