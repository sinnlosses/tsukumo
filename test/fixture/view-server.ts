// 会話は流さない（配るのはページ・同梱物・立ち絵と、架空のファイル一覧だけ）。

import { createRpcRouter, type RpcRouterPorts } from "../../src/router.ts"
import {
  createStartupToken,
  type FindReportImage,
  type ServeCharacterAsset,
  startViewServer,
  type ViewServer,
} from "../../src/server/view-server/adapter/server.ts"
import { UNAVAILABLE_CONTEXT_USAGE } from "../../src/shared/context-usage/context-usage.ts"
import { UNAVAILABLE_PLAN_USAGE } from "../../src/shared/plan-usage/plan-usage.ts"
import { UNREADABLE_FILE_EXCERPT } from "../../src/shared/repository/file-excerpt.ts"
import { UNAVAILABLE_SESSION_DIGEST } from "../../src/shared/session/session-digest.ts"
import { EMPTY_TOKEN_USAGE_SUMMARY } from "../../src/shared/token-usage/token-usage-summary.ts"

export const TOKEN = createStartupToken()

/** ブラウザ側スクリプトの代役。本物のビルドはしない（テストから `vite build` を起こさない）。 */
export const TEST_UI_SCRIPT = "/* テスト用の ui スクリプト */"

/** CSS の代役。本物のビルドはしない。 */
export const TEST_STYLE_SHEET = "/* テスト用の CSS */"

/** `import()` で分けたチャンクの代役。 */
export const TEST_CHUNK_NAME = "markdown-renderer.js"
export const TEST_CHUNK = "/* テスト用のチャンク */"

/**
 * 手続きの口の代役。既定では、ファイル一覧は空（git リポジトリでないとき）、集計は記録が1件も
 * 無い期間、内訳は取れない（セッションがまだ繋がっていない）、成果と暦は「main が読めない」。
 * 個々のテストが必要な分だけ上書きする。
 */
export const EMPTY_RPC_PORTS = {
  listRepositoryFiles: () => Promise.resolve({ paths: [], omittedCount: 0 }),
  readFileExcerpt: () => Promise.resolve(UNREADABLE_FILE_EXCERPT),
  refreshTasks: () => Promise.resolve(),
  projectName: () => "架空のプロジェクト",
  readTokenUsageSummary: () => EMPTY_TOKEN_USAGE_SUMMARY,
  readContextUsage: () => Promise.resolve(UNAVAILABLE_CONTEXT_USAGE),
  readPlanUsage: () => Promise.resolve(UNAVAILABLE_PLAN_USAGE),
  readSessionDigest: () => Promise.resolve(UNAVAILABLE_SESSION_DIGEST),
  readOccupiedSessionIds: () => Promise.resolve([]),
  readAchievementDay: () => Promise.resolve({ kind: "ok", achievement: { kind: "unknown" } }),
  readAchievementCalendar: () => Promise.resolve({ kind: "ok", calendar: { kind: "unknown" } }),
  reportBrowserError: () => {},
  recordSplit: () => {},
  readWorkflowSetting: () =>
    Promise.resolve({
      kind: "unavailable",
      repository: { worktreeName: "架空のプロジェクト", configPath: "/架空/.tw/config.toml" },
      reason: "tw-missing",
      detail: "PATH の tw",
    }),
} satisfies RpcRouterPorts

/**
 * `/character/<pack>/<file>` を配る係の代役。既定では何も配らない（404）。個々のテストが必要な分だけ
 * 上書きする（`readCharacterAsset` の代役）。
 */
export function noCharacterAsset(): undefined {
  return undefined
}

/** 棚の代役。既定では何も置いていない（どの id を引いても無い）。 */
export function noPromptImage(): undefined {
  return undefined
}

export function noReportImage(): undefined {
  return undefined
}

export async function startView(
  serveCharacterAsset: ServeCharacterAsset = noCharacterAsset,
  findPromptImage: (id: string) => string | undefined = noPromptImage,
  rpcPorts: Partial<RpcRouterPorts> = {},
  findReportImage: FindReportImage = noReportImage,
  onRuntimeError: (error: unknown) => void = () => {},
): Promise<ViewServer> {
  const server = await startViewServer(0, {
    ui: () => ({
      kind: "bundle",
      bundle: {
        uiScript: TEST_UI_SCRIPT,
        styleSheet: TEST_STYLE_SHEET,
        chunks: new Map([[TEST_CHUNK_NAME, TEST_CHUNK]]),
      },
    }),
    serveCharacterAsset,
    findPromptImage,
    findReportImage,
    rpcRouter: createRpcRouter({ ...EMPTY_RPC_PORTS, ...rpcPorts }),
    token: TOKEN,
    onRuntimeError,
  })
  trackView(server)
  return server
}

/** 各ファイルの `afterEach` に渡す。`startView` と `trackView` で起こしたサーバを閉じる。 */
export async function closeRunningView(): Promise<void> {
  await runningView?.close()
  runningView = undefined
}

/** `startViewServer` を直に呼んだテストが、起こしたサーバを `closeRunningView` で閉じてもらう。 */
export function trackView(server: ViewServer): void {
  runningView = server
}

export function viewOrigin(server: ViewServer): string {
  return new URL(server.layoutUrl).origin
}

let runningView: ViewServer | undefined
