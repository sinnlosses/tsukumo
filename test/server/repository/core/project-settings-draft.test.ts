import { describe, expect, it } from "vitest"

import { projectSettingsDraftOf } from "../../../../src/server/repository/core/project-settings-draft.ts"

describe("projectSettingsDraftOf", () => {
  it("ファイルが無ければ、origin/HEAD から主ブランチを推し量る", () => {
    expect(
      projectSettingsDraftOf({
        settings: { kind: "none" },
        originHead: { kind: "found", branch: "trunk" },
      }),
    ).toEqual({
      file: "none",
      mainBranch: { value: "trunk", inferred: true },
      runPrompt: { value: "/next-task {id}", inferred: false },
    })
  })

  it("origin/HEAD も無ければ、推し量らずに main を置く", () => {
    expect(
      projectSettingsDraftOf({
        settings: { kind: "none" },
        originHead: { kind: "missing" },
      }),
    ).toEqual({
      file: "none",
      mainBranch: { value: "main", inferred: false },
      runPrompt: { value: "/next-task {id}", inferred: false },
    })
  })

  it("ファイルが読めないときも推し量り、読めないことを file に残す", () => {
    expect(
      projectSettingsDraftOf({
        settings: { kind: "invalid" },
        originHead: { kind: "found", branch: "develop" },
      }),
    ).toMatchObject({
      file: "invalid",
      mainBranch: { value: "develop", inferred: true },
    })
  })

  it("ファイルが読めれば、その値をそのまま出して推し量らない", () => {
    expect(
      projectSettingsDraftOf({
        settings: { kind: "read", tasks: { mainBranch: "main", runPrompt: "/work {id}" } },
        originHead: { kind: "found", branch: "trunk" },
      }),
    ).toEqual({
      file: "read",
      mainBranch: { value: "main", inferred: false },
      runPrompt: { value: "/work {id}", inferred: false },
    })
  })
})
