// ホスト依存の操作（src/host.ts）を Orca の CLI で実装するアダプタ。
//
// **`orca` コマンドを呼ぶのはこのファイルだけ**（docs/architecture.md 原則3）。
// 実際に Orca が動いていないと結果を確かめられないので、ここは自動テストの対象にしない。
//
// Orca CLI の対応関係（v1.4.194 で確認）:
//   openPane  → orca terminal split --direction horizontal|vertical [--command <text>]
//   showView  → orca tab list --json でこの URL のタブを探し、あれば orca reload --page <id>、
//               無ければ orca tab create --url <url>
// `--direction` は `horizontal` が左右に、`vertical` が上下に並べる（Orca 本体のレイアウト実装で、
// horizontal のときだけ flex-direction が row になることを確認した）。

import { execFile } from "node:child_process"

import { type Host, type HostResult, type PaneRequest } from "./host.ts"

const ORCA_COMMAND = "orca"

/** Orca のアダプタを作る。`orca` が入っていない環境でも、失敗を返すだけで例外は投げない。 */
export function createOrcaHost(): Host {
  return {
    openPane: (request) => openPane(request),
    showView: (url) => showView(url),
  }
}

async function openPane(request: PaneRequest): Promise<HostResult> {
  const direction = request.placement === "beside" ? "horizontal" : "vertical"
  const commandArgs = request.command === undefined ? [] : ["--command", request.command]
  const result = await runOrca(["terminal", "split", "--direction", direction, ...commandArgs])

  return result.ok ? { ok: true } : { ok: false, reason: result.reason }
}

async function showView(url: string): Promise<HostResult> {
  const pageId = await findViewPageId(url)
  if (pageId !== undefined) {
    const reloaded = await runOrca(["reload", "--page", pageId, "--json"])
    if (reloaded.ok) {
      return { ok: true }
    }
    // 一覧に載っていたタブが既に閉じられていることがあるので、開き直しに倒す。
  }

  const created = await runOrca(["tab", "create", "--url", url, "--json"])
  return created.ok ? { ok: true } : { ok: false, reason: created.reason }
}

/**
 * 同じ URL で開いているタブのページIDを探す。一覧が取れない・形が想定と違うときは undefined を
 * 返し、呼び出し側で新しく開く側に倒す（推測で壊れた ID を渡さない）。
 */
async function findViewPageId(url: string): Promise<string | undefined> {
  const listed = await runOrca(["tab", "list", "--json"])
  if (!listed.ok) {
    return undefined
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(listed.stdout)
  } catch {
    return undefined
  }

  return findPageIdInTabList(parsed, url)
}

// `orca tab list --json` は { result: { tabs: [{ url, browserPageId }] } } を返す。
// 外部コマンドの出力なので構造を信用せず、必要な2つのフィールドが揃った要素だけを採る。
function findPageIdInTabList(value: unknown, url: string): string | undefined {
  if (!isRecord(value) || !isRecord(value.result) || !Array.isArray(value.result.tabs)) {
    return undefined
  }

  const tabs: readonly unknown[] = value.result.tabs
  for (const tab of tabs) {
    if (isRecord(tab) && tab.url === url && typeof tab.browserPageId === "string") {
      return tab.browserPageId
    }
  }

  return undefined
}

type CommandOutput =
  | { readonly ok: true; readonly stdout: string }
  | { readonly ok: false; readonly reason: string }

function runOrca(args: readonly string[]): Promise<CommandOutput> {
  return new Promise((resolve) => {
    execFile(ORCA_COMMAND, [...args], { encoding: "utf8" }, (error, stdout) => {
      if (error === null) {
        resolve({ ok: true, stdout })
        return
      }

      resolve({ ok: false, reason: describeFailure(args, error) })
    })
  })
}

function describeFailure(args: readonly string[], error: unknown): string {
  if (isRecord(error) && error.code === "ENOENT") {
    return `${ORCA_COMMAND} コマンドが見つからない`
  }

  const message = isRecord(error) && typeof error.message === "string" ? error.message : "原因不明"
  const firstLine = message.split("\n")[0] ?? message
  return `${ORCA_COMMAND} ${args.join(" ")} が失敗した: ${firstLine}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
