import { type ChildProcess, spawn } from "node:child_process"
import { join } from "node:path"
import process from "node:process"

import { INSTANCE_LOCATION_DIR_NAME } from "../../src/server/view-server/adapter/instance-location-file.ts"
import { readInstanceLocation } from "./instance-location.ts"

export type FakeTsukumoOptions = {
  /** 起こす CLI の入口ファイルのパス。 */
  readonly entry: string
  readonly cwd: string
  /** 起こした直後に流す疑似セッションの場面。 */
  readonly scene: string | undefined
  /** 疑似セッションのファイル（`TSUKUMO_FAKE_SESSION`）。undefined なら同梱のファイル。 */
  readonly session: string | undefined
  /** 0 なら空きポート。 */
  readonly port: number
  /** `TSUKUMO_HOME` に渡すホーム。所在のファイルもその下に書かれる。 */
  readonly home: string
  readonly extraEnv: Readonly<Record<string, string>>
  /** 親の `TSUKUMO_` で始まる変数を外してから渡す。 */
  readonly dropInheritedTsukumoEnv: boolean
  readonly stderr: "inherit" | "pipe"
}

/** 駆動を fake に固定し、タブを開かない tsukumo を1つ起こす。 */
export function spawnFakeTsukumo(options: FakeTsukumoOptions): ChildProcess {
  const inherited = options.dropInheritedTsukumoEnv
    ? Object.fromEntries(
        Object.entries(process.env).filter(([name]) => !name.startsWith("TSUKUMO_")),
      )
    : process.env
  return spawn("node", [options.entry], {
    cwd: options.cwd,
    env: {
      ...inherited,
      TSUKUMO_DRIVER: "fake",
      ...(options.scene === undefined ? {} : { TSUKUMO_FAKE_SCENE: options.scene }),
      ...(options.session === undefined ? {} : { TSUKUMO_FAKE_SESSION: options.session }),
      TSUKUMO_HOME: options.home,
      TSUKUMO_VIEW_PORT: String(options.port),
      TSUKUMO_OPEN_VIEW: "0",
      ...options.extraEnv,
    },
    stdio: ["ignore", "pipe", options.stderr],
  })
}

/**
 * 起こした tsukumo が所在のファイルに書いた配信 URL を待つ。`home` は起こすときに渡したホーム。
 * 書かれないまま終わる・上限を過ぎたときは reject する。
 * 標準エラーをパイプで受けているときは、reject のメッセージに添える。
 */
export function waitForViewUrl(
  child: ChildProcess,
  home: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let stderr = ""
    const detail = (): string => (stderr === "" ? "" : `\n${stderr}`)
    const path = join(home, INSTANCE_LOCATION_DIR_NAME, `${String(child.pid)}.json`)
    const finish = (settle: () => void): void => {
      clearTimeout(timer)
      clearInterval(poll)
      settle()
    }
    const timer = setTimeout(() => {
      finish(() => {
        reject(new Error(`tsukumo が所在を書かない（${String(timeoutMs)}ms）${detail()}`))
      })
    }, timeoutMs)
    const poll = setInterval(() => {
      const location = readInstanceLocation(path)
      if (location !== undefined) {
        finish(() => {
          resolve(location.url)
        })
      }
    }, LOCATION_POLL_INTERVAL_MS)

    child.stdout?.resume()
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8")
    })
    child.once("exit", (code) => {
      finish(() => {
        reject(new Error(`tsukumo が終了した（コード ${String(code)}）${detail()}`))
      })
    })
  })
}

/** 所在のファイルを見に行く間隔（ミリ秒）。 */
const LOCATION_POLL_INTERVAL_MS = 50
