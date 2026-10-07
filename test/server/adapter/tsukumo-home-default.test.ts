import { tmpdir } from "node:os"

import { expect, it } from "vitest"

import { tsukumoHomeDir } from "../../../src/server/adapter/tsukumo-home.ts"

it("単体テストの既定のホームは一時ディレクトリの下を指す", () => {
  expect(tsukumoHomeDir().startsWith(tmpdir())).toBe(true)
})
