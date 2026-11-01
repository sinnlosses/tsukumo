import { describe, expect, it } from "vitest"

import { splitE2eFiles } from "../../../scripts/shared/e2e-runner.ts"

const TABLE = ["test/e2e/a.test.ts", "test/e2e/b.test.ts"]

describe("splitE2eFiles", () => {
  it("表に載るファイルは playwright、載らないファイルは vitest へ分ける", () => {
    expect(splitE2eFiles(["test/e2e/a.test.ts", "test/e2e/c.test.ts"], TABLE)).toEqual({
      vitest: ["test/e2e/c.test.ts"],
      playwright: ["test/e2e/a.test.ts"],
    })
  })

  it("渡された順を、それぞれの側で保つ", () => {
    expect(
      splitE2eFiles(
        ["test/e2e/z.test.ts", "test/e2e/b.test.ts", "test/e2e/y.test.ts", "test/e2e/a.test.ts"],
        TABLE,
      ),
    ).toEqual({
      vitest: ["test/e2e/z.test.ts", "test/e2e/y.test.ts"],
      playwright: ["test/e2e/b.test.ts", "test/e2e/a.test.ts"],
    })
  })

  it("`./` を付けて渡されても表のパスとして数え、渡された文字列のまま返す", () => {
    expect(splitE2eFiles(["./test/e2e/a.test.ts"], TABLE)).toEqual({
      vitest: [],
      playwright: ["./test/e2e/a.test.ts"],
    })
  })

  it("空の列は両方とも空", () => {
    expect(splitE2eFiles([], TABLE)).toEqual({ vitest: [], playwright: [] })
  })

  it("表が空なら全部 vitest", () => {
    expect(splitE2eFiles(["test/e2e/a.test.ts"], [])).toEqual({
      vitest: ["test/e2e/a.test.ts"],
      playwright: [],
    })
  })
})
