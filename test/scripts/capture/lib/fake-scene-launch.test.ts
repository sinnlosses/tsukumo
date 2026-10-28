import { join } from "node:path"

import { describe, expect, test } from "vitest"

import { launchFakeScene } from "../../../../scripts/capture/lib/fake-scene-launch.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

describe("疑似セッションの起動前の成果物の検査", () => {
  const tempDir = useTempDir("fake-scene-launch")

  // cwd が無いので、起こしていれば別の理由で落ちる。pnpm run build の文なら検査で止まっている。
  test("成果物が古い・読めないなら、子を起こさず pnpm run build を促して落ちる", async () => {
    await expect(
      launchFakeScene({
        cwd: join(tempDir(), "no-such-directory"),
        scene: "any",
        home: tempDir(),
        session: undefined,
        extraEnv: {},
        builtDir: tempDir(),
      }),
    ).rejects.toThrow("pnpm run build")
  })
})
