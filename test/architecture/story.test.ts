import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { listSourceFiles, relativeImportSpecifiers, SRC_ROOT } from "./source-file.ts"

// story（Storybook）の置き場（`docs/architecture.md`「ディレクトリ」）。
// story は `src/` の外の `story/` に、描く部品と同じ相対パスで置く（`src/X.tsx` → `story/X.story.tsx`）。
// `src/` の中に置くと、箱と機能の辺の検査が story を読み手として数えてしまう。
// story はブラウザで描くので、import してよいのは browser と shared だけ（browser の層と同じ）。
const STORY_ROOT = fileURLToPath(new URL("../../story", import.meta.url)).replace(/\/$/, "")
const STORY_SUFFIX = ".story.tsx"

describe("story の置き場", () => {
  it("src/ の中に story を置かない", () => {
    const offenders = listSourceFiles(SRC_ROOT).filter((relPath) => relPath.endsWith(STORY_SUFFIX))

    expect(offenders).toEqual([])
  })

  it("story/ の story は、同じ相対パスの src/ の部品を持つ", () => {
    const offenders = listSourceFiles(STORY_ROOT).filter(
      (relPath) =>
        !relPath.endsWith(STORY_SUFFIX) ||
        !existsSync(`${SRC_ROOT}/${relPath.slice(0, -STORY_SUFFIX.length)}.tsx`),
    )

    expect(offenders).toEqual([])
  })

  it("story/ の相対 import は src/browser/ と src/shared/ だけを指す", () => {
    const offenders = listSourceFiles(STORY_ROOT).flatMap((relPath) =>
      relativeImportSpecifiers(readFileSync(`${STORY_ROOT}/${relPath}`, "utf8"))
        .map((specifier) =>
          path.relative(
            SRC_ROOT,
            path.resolve(path.dirname(`${STORY_ROOT}/${relPath}`), specifier),
          ),
        )
        .filter((target) => !target.startsWith("browser/") && !target.startsWith("shared/"))
        .map((target) => `story/${relPath} → src/${target}`),
    )

    expect(offenders).toEqual([])
  })
})
