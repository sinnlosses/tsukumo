import { describe, expect, it } from "bun:test"
import { spawnSync } from "node:child_process"
import { createServer as createNetServer, type Server as NetServer } from "node:net"

import {
  CHARACTER_ENV_NAME,
  DRIVER_ENV_NAME,
  FAKE_SCENE_ENV_NAME,
  NEW_SESSION_ENV_NAME,
  OPEN_VIEW_ENV_NAME,
  VIEW_PORT_ENV_NAME,
  WATCH_UI_ENV_NAME,
} from "../src/server/core/config.ts"
import {
  DEFAULT_VIEW_PORT,
  VIEW_PORT_FALLBACK_ATTEMPTS,
} from "../src/server/core/port-resolution.ts"

// **このファイルは CLI を起動しきらないものだけを扱う。**
// 2026-09-11 に起動経路が transcript の追従から SDK のセッション駆動へ変わり、CLI を最後まで
// 起動すると Claude Code の子プロセスが立ち上がるようになった。テストから実際のセッションを
// 起こすわけにはいかないので、**起動の前提チェックで終わるところまで**をここで守る。
//
// 追従・状態ファイル・立ち絵のフォールバック・ビューの中身を端から端まで見ていたテストは、
// この変更で対象そのものが無くなった。振る舞い自体は次のテストが守っている:
//   - メインビュー・レポート・ツールの行・質問の記録（React の部品）: test/browser/features/main-view/**
//   - Markdown の変換（unified）: test/browser/features/main-view/markdown/**
//   - 配信（バインド先・経路・静的アセット・依頼の受け口）と WebSocket の経路
//     （トークン・Origin・hello・コマンド）: test/server/adapter/server.test.ts
//   - キャラクター定義の解釈と立ち絵の選び方: test/shared/character.test.ts
//   - SDK のイベントの変換・答え待ち・畳み込み: test/server/core/sdk-message.test.ts /
//     test/server/core/pending-answer.test.ts / test/shared/session-state.test.ts
// 実際に画面に出ているかは目視で確かめる（docs/architecture.md「手で確かめること」）。

const ENTRY = new URL("../src/cli.ts", import.meta.url).pathname

/**
 * CLI が読む環境変数（名前は `src/server/core/config.ts` が持つ）。**引き継がずに落とす**
 * ——tsukumo が起こした claude の中でテストを走らせると、その tsukumo 自身の設定が spawn 先へ
 * 漏れて結果が変わる（`TSUKUMO_VIEW_PORT` を渡して起こした環境では、既定ポートを前提にした
 * 下のテストが「明示指定」の経路に落ちて20秒待たされた）。渡すのは各テストが明示した分だけ。
 */
const CLI_ENV_NAMES: ReadonlySet<string> = new Set([
  VIEW_PORT_ENV_NAME,
  CHARACTER_ENV_NAME,
  OPEN_VIEW_ENV_NAME,
  DRIVER_ENV_NAME,
  FAKE_SCENE_ENV_NAME,
  NEW_SESSION_ENV_NAME,
  WATCH_UI_ENV_NAME,
])

function runCliToExit(args: readonly string[], env: Readonly<Record<string, string>>) {
  const inherited = Object.entries(process.env).flatMap(([key, value]) =>
    value === undefined || CLI_ENV_NAMES.has(key) ? [] : [[key, value] as const],
  )

  return spawnSync("bun", ["run", ENTRY, ...args], {
    encoding: "utf8",
    env: { ...Object.fromEntries(inherited), ...env },
  })
}

/** ポート1つを塞ぐダミーの TCP サーバ（`node:http` を起こす必要はなく、塞げれば十分）。 */
function listenOnEphemeralPort(): Promise<NetServer> {
  return new Promise((resolve, reject) => {
    const server = createNetServer()
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => resolve(server))
  })
}

/** 指定したポートを塞ぐ。既に塞がっている（例: 常駐している 7327 番）ときはそのまま無視する。 */
function listenOnPortIfFree(port: number): Promise<NetServer | undefined> {
  return new Promise((resolve) => {
    const server = createNetServer()
    server.on("error", () => resolve(undefined))
    server.listen(port, "127.0.0.1", () => resolve(server))
  })
}

function portOf(server: NetServer): number {
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("ポート番号を取れない")
  }
  return address.port
}

function closeNetServer(server: NetServer): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()))
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

  // 以下の2つは「起動時の前提チェックで終わる」経路のまま安全に確かめられる。
  // **明示指定は失敗してもずらさない**ので必ず終了コード1（セッションは起こらない）。
  // **全滅も必ず終了コード1**（ずらす先が無いのでどのみち起こらない）。
  // 「既定ポートが塞がっていて、ずらした先で実際に listen できる」経路だけは、成功すると
  // 本物のセッション（claude の子プロセス）が起きてしまうため、ここでは確かめない
  // （手元での目視確認に譲る。CLAUDE.md「テスト方針」）。

  it("TSUKUMO_VIEW_PORT で明示したポートが塞がっていると、ずらさず終了コード1で終わる", async () => {
    const blocker = await listenOnEphemeralPort()
    try {
      const blockedPort = portOf(blocker)
      const result = runCliToExit([], { TSUKUMO_VIEW_PORT: String(blockedPort) })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain("ビューを配れない")
    } finally {
      await closeNetServer(blocker)
    }
  })

  it("既定ポートから上限まで全部塞がっていると、試した範囲を伝えて終了コード1で終わる", async () => {
    const blockers: NetServer[] = []
    try {
      for (let i = 0; i < VIEW_PORT_FALLBACK_ATTEMPTS; i++) {
        const server = await listenOnPortIfFree(DEFAULT_VIEW_PORT + i)
        if (server !== undefined) {
          blockers.push(server)
        }
      }

      const result = runCliToExit([], {})

      expect(result.status).toBe(1)
      expect(result.stderr).toContain(String(DEFAULT_VIEW_PORT))
      expect(result.stderr).toContain(String(DEFAULT_VIEW_PORT + VIEW_PORT_FALLBACK_ATTEMPTS - 1))
    } finally {
      for (const server of blockers) {
        await closeNetServer(server)
      }
    }
  }, 20_000)
})
