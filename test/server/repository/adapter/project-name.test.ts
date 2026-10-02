import { describe, expect, it } from "vitest"

import { projectNameOf } from "../../../../src/server/repository/adapter/project-name.ts"

describe("projectNameOf", () => {
  it("末尾のディレクトリ名を返す（末尾のスラッシュは無視する）", () => {
    expect(projectNameOf("/work/fictional/tsukumo-2")).toBe("tsukumo-2")
    expect(projectNameOf("/work/fictional/tsukumo-2/")).toBe("tsukumo-2")
  })

  it("名前が取れないときは渡されたパスをそのまま返す", () => {
    expect(projectNameOf("/")).toBe("/")
  })
})
