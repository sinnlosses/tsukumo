import { matchesGlob } from "node:path"

import { describe, expect, it } from "vitest"

import { entrypointsWithin } from "../../../../src/server/architecture-map/core/map-entrypoint.ts"

describe("entrypointsWithin", () => {
  const globs = ["src/ui/**", "src/view/*"]

  it("どれかの glob に当たる入口は元の順で残る", () => {
    expect(
      entrypointsWithin(globs, ["src/view/main.ts", "src/ui/part/index.ts"], matchesGlob),
    ).toEqual(["src/view/main.ts", "src/ui/part/index.ts"])
  })

  it("どの glob にも当たらない入口は外れる", () => {
    expect(
      entrypointsWithin(
        globs,
        ["src/ui/index.ts", "src/server/index.ts", "src/view/core/a.ts"],
        matchesGlob,
      ),
    ).toEqual(["src/ui/index.ts"])
  })

  it("全部外れたら空", () => {
    expect(entrypointsWithin(globs, ["src/server/index.ts"], matchesGlob)).toEqual([])
  })
})
