import { mkdir, readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

import { fictionalPng } from "../../scripts/shared/fictional-png.ts"
import { expect, test } from "./room-fixture.ts"

// ADR 0073 の最終レポートの HTML 書き出し。
// 押す → 保存先に1つ書かれる → 知らせの1行にそのパスが出る、を実ブラウザで確かめる。
// 書かれたファイルと DOM の写しは実ブラウザでしか確かめられないので、判定は期待値のファイルに撮らず `expect` に書く。
// 「ブラウザで開く」「Finder で表示」は押さない（`open` を起こさない）。

const EXTERNAL_REFERENCE =
  /(?:src|href)="(?:https?:\/\/|\/report-image\/)|url\(\s*["']?(?:https?:\/\/|\/report-image\/)/u

test.describe("最終レポートの HTML での書き出し", () => {
  test("押すと外部の読み込みの無い HTML が1つ書かれ、知らせの1行に保存先のパスが出る", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "report-export",
      scene: "report-export",
      viewport: "wide",
      domRoots: ["main"],
      cwdFiles: [{ path: "report-image-fixture/after.png", content: fictionalPng(8, 4) }],
    })

    // 書き出しは保存先を作らない（利用者の `~/Downloads/` は在る）ので、一時のホームには先に作る。
    const downloads = join(room.userHome, "Downloads")
    await mkdir(downloads)

    await room.waitForEvent("turn-finished")
    await room.page.getByRole("button", { name: "HTML で保存" }).click()

    const notice = room.page.getByRole("status").filter({ hasText: "✓ 保存した" })
    await notice.waitFor()

    const files = await readdir(downloads)
    expect(files).toHaveLength(1)
    const [fileName = ""] = files
    expect(fileName.endsWith(".html")).toBe(true)

    const html = await readFile(join(downloads, fileName), "utf8")
    expect(html).toMatch(/<img[^>]*src="data:image\/png;base64,/u)
    expect(html).not.toMatch(EXTERNAL_REFERENCE)

    await expect(notice).toContainText(join(downloads, fileName))
  })
})
