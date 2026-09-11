import { describe, expect, it } from "bun:test"
import { spawnSync } from "node:child_process"

// **このファイルは CLI を起動しきらないものだけを扱う。**
// 2026-09-11 に起動経路が transcript の追従から SDK のセッション駆動へ変わり、CLI を最後まで
// 起動すると Claude Code の子プロセスが立ち上がるようになった。テストから実際のセッションを
// 起こすわけにはいかないので、**起動の前提チェックで終わるところまで**をここで守る。
//
// 追従・状態ファイル・立ち絵のフォールバック・ビューの中身を端から端まで見ていたテストは、
// この変更で対象そのものが無くなった。振る舞い自体は次のテストが守っている:
//   - ビューの HTML の組み立て（吹き出し・メインビュー・サイドバー）: test/view.test.ts
//   - 配信（バインド先・経路・SSE・依頼の受け口）: test/view-server.test.ts
//   - キャラクター定義の解釈と立ち絵の選び方: test/character.test.ts
//   - SDK のイベントの変換・答え待ち・畳み込み: test/session-event.test.ts /
//     test/pending-answer.test.ts / test/session-view.test.ts
// 実際に画面に出ているかは目視で確かめる（docs/architecture.md「手で確かめること」）。

const ENTRY = new URL("../src/index.ts", import.meta.url).pathname

function runCliToExit(args: readonly string[], env: Readonly<Record<string, string>>) {
  const inherited = Object.entries(process.env).flatMap(([key, value]) =>
    value === undefined ? [] : [[key, value] as const],
  )

  return spawnSync("bun", ["run", ENTRY, ...args], {
    encoding: "utf8",
    env: { ...Object.fromEntries(inherited), ...env },
  })
}

describe("tsukumo CLI", () => {
  it("ポート番号として読めない設定のとき、理由を伝えて終了コード1で終わる", () => {
    const result = runCliToExit([], { TSUKUMO_VIEW_PORT: "ぜんぶ" })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("TSUKUMO_VIEW_PORT")
  })

  it("--help で使い方を表示して終了コード0で終わる（セッションは起こさない）", () => {
    const result = runCliToExit(["--help"], { TSUKUMO_VIEW_PORT: "0" })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("使い方:")
  })
})
