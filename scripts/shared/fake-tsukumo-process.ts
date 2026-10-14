import { type ChildProcess, spawn } from "node:child_process"
import process from "node:process"

export type FakeTsukumoOptions = {
  /** 起こす CLI の入口ファイルのパス。 */
  readonly entry: string
  readonly cwd: string
  /** 起こした直後に流す疑似セッションの場面。 */
  readonly scene: string | undefined
  /** 0 なら空きポート。 */
  readonly port: number
  /** 渡すと `TSUKUMO_HOME` を上書きする。 */
  readonly home: string | undefined
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
      ...(options.home === undefined ? {} : { TSUKUMO_HOME: options.home }),
      TSUKUMO_VIEW_PORT: String(options.port),
      TSUKUMO_OPEN_VIEW: "0",
      ...options.extraEnv,
    },
    stdio: ["ignore", "pipe", options.stderr],
  })
}

/**
 * 起こした tsukumo が出す配信 URL を待つ。出ないまま終わる・上限を過ぎたときは reject する。
 * 標準エラーをパイプで受けているときは、reject のメッセージに添える。
 */
export function waitForViewUrl(child: ChildProcess, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = ""
    let stderr = ""
    const detail = (): string => (stderr === "" ? "" : `\n${stderr}`)
    const timer = setTimeout(() => {
      reject(new Error(`tsukumo が URL を出さない（${String(timeoutMs)}ms）${detail()}`))
    }, timeoutMs)

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8")
    })
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8")
      const url = /https?:\/\/\S+/.exec(stdout)?.[0]
      if (url !== undefined) {
        clearTimeout(timer)
        resolve(url)
      }
    })
    child.once("exit", (code) => {
      clearTimeout(timer)
      reject(new Error(`tsukumo が終了した（コード ${String(code)}）${detail()}`))
    })
  })
}
