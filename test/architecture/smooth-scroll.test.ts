import { describe, expect, it } from "vitest"

import { withoutComments } from "./comment-line.ts"
import { listSourceFiles, readSourceFile, SRC_ROOT } from "./source-file.ts"

// 滑らかに転がす指定を、動きを減らす設定で一度に送る指定へ替える1か所に揃える。
// 外で `"smooth"` を書くと、利用者の設定を無視して転がり、E2E では転がっている途中の位置を測って揺れる。
describe("滑らかに転がす指定", () => {
  it('src/browser で `"smooth"` を書くのは src/browser/components/page/conversation/components/hooks/smooth-scroll.ts だけ（ほかは smoothScrollBehavior() を渡す）', () => {
    const allowed = "browser/components/page/conversation/components/hooks/smooth-scroll.ts"
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => relPath.startsWith("browser/") && relPath !== allowed)
      .filter((relPath) => /["'`]smooth["'`]/.test(withoutComments(readSourceFile(relPath))))

    expect(offenders).toEqual([])
  })
})
