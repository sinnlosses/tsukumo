import { mkdirSync } from "node:fs"
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
  it("ファイルが無ければ設定なし", async () => {
    expect(await readProjectSettings(root())).toEqual({ kind: "none" })
  })

  it("書いてあれば読む", async () => {
    writeProjectSettingsFixture(root())

    expect(await readProjectSettings(root())).toEqual({
      kind: "read",
      tasks: { mainBranch: "main", runPrompt: "/next-task {id}" },
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
    const tasks = { mainBranch: "trunk", runPrompt: "/work {id}" } as const

    expect(await writeProjectSettings(root(), tasks)).toBe(true)
    expect(await readProjectSettings(root())).toEqual({ kind: "read", tasks })
  })

  it("読めない中身を上書きする", async () => {
    writeProjectSettingsContent(root(), "{")

    await writeProjectSettings(root(), { mainBranch: "main", runPrompt: "/next-task {id}" })

    expect((await readProjectSettings(root())).kind).toBe("read")
  })
})

describe("readProjectSettingsDraft", () => {
  it("origin/HEAD から下書きを組む", async () => {
    await initGitRepository(root())
    await git(root(), "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk")

    expect(await readProjectSettingsDraft(root())).toEqual({
      file: "none",
      mainBranch: { value: "trunk", inferred: true },
      runPrompt: { value: "/next-task {id}", inferred: false },
    })
  })

  it("git リポジトリでなければ、推し量らない", async () => {
    expect(await readProjectSettingsDraft(root())).toEqual(PLAIN_PROJECT_SETTINGS_DRAFT)
  })
})
