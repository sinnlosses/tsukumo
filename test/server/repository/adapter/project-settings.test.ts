import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  readProjectSettings,
  readProjectSettingsDraft,
  writeProjectSettings,
} from "../../../../src/server/repository/adapter/project-settings.ts"
import { git, initGitRepository } from "../../../fixture/git-repository.ts"
import {
  PLAIN_PROJECT_SETTINGS_DRAFT,
  writeProjectSettings as writeProjectSettingsFixture,
  writeProjectSettingsContent,
} from "../../../fixture/project-settings.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const root = useTempDir("project-settings")

describe("readProjectSettings", () => {
  it("ファイルが無ければタスク運用なし", async () => {
    expect(await readProjectSettings(root())).toEqual({ kind: "none" })
  })

  it("書いてあれば読む", async () => {
    writeProjectSettingsFixture(root(), "beads")

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

describe("writeProjectSettings", () => {
  it(".tsukumo/ が無くても作って書き、readProjectSettings で読み戻せる", async () => {
    const tasks = { store: "beads", mainBranch: "trunk", runPrompt: "/work {id}" } as const

    expect(await writeProjectSettings(root(), tasks)).toBe(true)
    expect(await readProjectSettings(root())).toEqual({ kind: "read", tasks })
  })

  it("読めない中身を上書きする", async () => {
    writeProjectSettingsContent(root(), "{")

    await writeProjectSettings(root(), {
      store: "files",
      mainBranch: "main",
      runPrompt: "/next-task {id}",
    })

    expect((await readProjectSettings(root())).kind).toBe("read")
  })
})

describe("readProjectSettingsDraft", () => {
  it("CLAUDE.md の「## タスク運用」節と origin/HEAD から下書きを組む", async () => {
    await initGitRepository(root())
    await git(root(), "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk")
    writeFileSync(
      join(root(), "CLAUDE.md"),
      ["# 架空", "", "## タスク運用", "", "- タスクの置き場: beads", "", "## 次の節", ""].join(
        "\n",
      ),
    )

    expect(await readProjectSettingsDraft(root())).toEqual({
      file: "none",
      store: { value: "beads", inferred: true },
      mainBranch: { value: "trunk", inferred: true },
      runPrompt: { value: "/next-task {id}", inferred: false },
    })
  })

  it("AGENTS.md に節があれば CLAUDE.md より先に読む", async () => {
    writeFileSync(join(root(), "AGENTS.md"), ["## タスク運用", "- 検証コマンド: なし"].join("\n"))
    writeFileSync(
      join(root(), "CLAUDE.md"),
      ["## タスク運用", "- タスクの置き場: beads"].join("\n"),
    )

    expect((await readProjectSettingsDraft(root())).store).toEqual({
      value: "files",
      inferred: true,
    })
  })

  it("git リポジトリでなく節も無ければ、推し量らない", async () => {
    expect(await readProjectSettingsDraft(root())).toEqual(PLAIN_PROJECT_SETTINGS_DRAFT)
  })
})
