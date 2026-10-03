import { mkdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { readProjectSettings } from "../../../../src/server/repository/adapter/project-settings.ts"
import {
  writeProjectSettings,
  writeProjectSettingsContent,
} from "../../../fixture/project-settings.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const root = useTempDir("project-settings")

describe("readProjectSettings", () => {
  it("ファイルが無ければタスク運用なし", async () => {
    expect(await readProjectSettings(root())).toEqual({ kind: "none" })
  })

  it("書いてあれば読む", async () => {
    writeProjectSettings(root(), "beads")

    expect(await readProjectSettings(root())).toEqual({
      kind: "read",
      tasks: { store: "beads", mainBranch: "main", runPrompt: "/next-task {id}" },
    })
  })

  it("壊れていれば読めない", async () => {
    writeProjectSettingsContent(root(), "{")

    expect(await readProjectSettings(root())).toEqual({ kind: "invalid" })
  })

  it("ファイルの代わりにディレクトリがあれば読めない", async () => {
    mkdirSync(join(root(), ".tsukumo", "project.json"), { recursive: true })

    expect(await readProjectSettings(root())).toEqual({ kind: "invalid" })
  })
})
