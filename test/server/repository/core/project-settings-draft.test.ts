import { describe, expect, it } from "vitest"

import { projectSettingsDraftOf } from "../../../../src/server/repository/core/project-settings-draft.ts"

const SECTION_BEADS = [
  "## タスク運用",
  "- 検証コマンド: `make check`",
  "- タスクの置き場: beads",
].join("\n")
const SECTION_FILES = ["## タスク運用", "- 検証コマンド: `make check`"].join("\n")

describe("projectSettingsDraftOf", () => {
  it("ファイルが無ければ、「## タスク運用」節の置き場の行と origin/HEAD から推し量る", () => {
    expect(
      projectSettingsDraftOf({
        settings: { kind: "none" },
        taskSection: { kind: "found", text: SECTION_BEADS },
        originHead: { kind: "found", branch: "trunk" },
      }),
    ).toEqual({
      file: "none",
      store: { value: "beads", inferred: true },
      mainBranch: { value: "trunk", inferred: true },
      runPrompt: { value: "/next-task {id}", inferred: false },
    })
  })

  it("節に置き場の行が無ければファイル方式と推し量る", () => {
    expect(
      projectSettingsDraftOf({
        settings: { kind: "none" },
        taskSection: { kind: "found", text: SECTION_FILES },
        originHead: { kind: "missing" },
      }).store,
    ).toEqual({ value: "files", inferred: true })
  })

  it("節も origin/HEAD も無ければ、推し量らずにファイル方式と main を置く", () => {
    expect(
      projectSettingsDraftOf({
        settings: { kind: "none" },
        taskSection: { kind: "missing" },
        originHead: { kind: "missing" },
      }),
    ).toEqual({
      file: "none",
      store: { value: "files", inferred: false },
      mainBranch: { value: "main", inferred: false },
      runPrompt: { value: "/next-task {id}", inferred: false },
    })
  })

  it("ファイルが読めないときも推し量り、読めないことを file に残す", () => {
    expect(
      projectSettingsDraftOf({
        settings: { kind: "invalid" },
        taskSection: { kind: "found", text: SECTION_BEADS },
        originHead: { kind: "found", branch: "develop" },
      }),
    ).toMatchObject({
      file: "invalid",
      store: { value: "beads", inferred: true },
      mainBranch: { value: "develop", inferred: true },
    })
  })

  it("ファイルが読めれば、その値をそのまま出して推し量らない", () => {
    expect(
      projectSettingsDraftOf({
        settings: {
          kind: "read",
          tasks: { store: "files", mainBranch: "main", runPrompt: "/work {id}" },
        },
        taskSection: { kind: "found", text: SECTION_BEADS },
        originHead: { kind: "found", branch: "trunk" },
      }),
    ).toEqual({
      file: "read",
      store: { value: "files", inferred: false },
      mainBranch: { value: "main", inferred: false },
      runPrompt: { value: "/work {id}", inferred: false },
    })
  })
})
