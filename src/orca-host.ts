// ホスト依存の操作（src/host.ts）を Orca の CLI で実装するアダプタ。
//
// **`orca` コマンドを呼ぶのはこのファイルだけ**（docs/architecture.md 原則3）。
// 実際に Orca が動いていないと結果を確かめられないので、ここは自動テストの対象にしない。
//
// Orca CLI の対応関係（v1.4.194 で確認、listPanes/sendText は v1.4.197 で確認）:
//   openPane  → orca terminal split --direction horizontal|vertical [--command <text>]
//   showView  → orca tab list --json でこの URL のタブを探し、あれば orca reload --page <id>、
//               無ければ orca tab create --url <url>
//   listPanes → orca terminal list --json。返る `handle` が id、表示名（label）は
//               `title` を優先し、無ければ `worktreePath`、どちらも無ければ `handle` を使う
//   sendText  → orca terminal send --terminal <handle> --text <text> --enter
// `--direction` は `horizontal` が左右に、`vertical` が上下に並べる（Orca 本体のレイアウト実装で、
// horizontal のときだけ flex-direction が row になることを確認した）。
//
// **`orca terminal send` は自動テストの対象にしない。** 動いているターミナル（利用者のセッション
// を含みうる）に実際に文字を送ってしまうため（README.md / docs/coding-standards.md）。

import { execFile } from "node:child_process"

import {
  type Host,
  type HostResult,
  type ListPanesResult,
  type Pane,
  type PaneRequest,
} from "./host.ts"

const ORCA_COMMAND = "orca"

/** Orca のアダプタを作る。`orca` が入っていない環境でも、失敗を返すだけで例外は投げない。 */
export function createOrcaHost(): Host {
  return {
    openPane: (request) => openPane(request),
    showView: (url) => showView(url),
    listPanes: () => listPanes(),
    sendText: (paneId, text) => sendText(paneId, text),
  }
}

async function openPane(request: PaneRequest): Promise<HostResult> {
  const direction = request.placement === "beside" ? "horizontal" : "vertical"
  const commandArgs = request.command === undefined ? [] : ["--command", request.command]
  const result = await runOrca(
    ["terminal", "split", "--direction", direction, ...commandArgs],
    "ペインを開く",
  )

  return result.ok ? { ok: true } : { ok: false, reason: result.reason }
}

async function showView(url: string): Promise<HostResult> {
  const pageId = await findViewPageId(url)
  if (pageId !== undefined) {
    const reloaded = await runOrca(["reload", "--page", pageId, "--json"], "ビューを更新する")
    if (reloaded.ok) {
      return { ok: true }
    }
    // 一覧に載っていたタブが既に閉じられていることがあるので、開き直しに倒す。
  }

  const created = await runOrca(["tab", "create", "--url", url, "--json"], "ビューを開く")
  return created.ok ? { ok: true } : { ok: false, reason: created.reason }
}

/**
 * 同じ URL で開いているタブのページIDを探す。一覧が取れない・形が想定と違うときは undefined を
 * 返し、呼び出し側で新しく開く側に倒す（推測で壊れた ID を渡さない）。
 */
async function findViewPageId(url: string): Promise<string | undefined> {
  const listed = await runOrca(["tab", "list", "--json"], "タブ一覧を取得する")
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

/**
 * 送信先として選べる、生きているターミナルの一覧を得る。一覧が取れない・形が想定と違うときは
 * `ok: false` を返し、呼び出し側（サーバ）が理由をそのまま利用者に見せる。
 */
async function listPanes(): Promise<ListPanesResult> {
  const listed = await runOrca(["terminal", "list", "--json"], "ターミナル一覧を取得する")
  if (!listed.ok) {
    return { ok: false, reason: listed.reason }
  }

  const panes = parsePaneList(listed.stdout)
  return panes === undefined
    ? { ok: false, reason: "ターミナル一覧の形式が読み取れない" }
    : { ok: true, panes }
}

async function sendText(paneId: string, text: string): Promise<HostResult> {
  const result = await runOrca(
    ["terminal", "send", "--terminal", paneId, "--text", text, "--enter"],
    "ターミナルへ送信する",
  )
  return result.ok ? { ok: true } : { ok: false, reason: result.reason }
}

// `orca terminal list --json` は { result: { terminals: [{ handle, title, worktreePath, ... }] } }
// を返す（実測）。外部コマンドの出力なので構造を信用せず、`handle` を持つ要素だけを採る。
function parsePaneList(stdout: string): readonly Pane[] | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return undefined
  }

  if (!isRecord(parsed) || !isRecord(parsed.result) || !Array.isArray(parsed.result.terminals)) {
    return undefined
  }

  const terminals: readonly unknown[] = parsed.result.terminals
  const panes: Pane[] = []
  for (const terminal of terminals) {
    const pane = paneFromTerminal(terminal)
    if (pane !== undefined) {
      panes.push(pane)
    }
  }

  return panes
}

function paneFromTerminal(value: unknown): Pane | undefined {
  if (!isRecord(value) || typeof value.handle !== "string") {
    return undefined
  }

  const title =
    typeof value.title === "string" && value.title.trim() !== "" ? value.title : undefined
  const worktreePath =
    typeof value.worktreePath === "string" && value.worktreePath.trim() !== ""
      ? value.worktreePath
      : undefined

  return { id: value.handle, label: title ?? worktreePath ?? value.handle }
}

type CommandOutput =
  | { readonly ok: true; readonly stdout: string }
  | { readonly ok: false; readonly reason: string }

/**
 * `orca` を1回呼ぶ。`label` は失敗したときの理由に使う、値を含まない固定の日本語（「ターミナルへ
 * 送信する」など）。**`args` 自体は理由の組み立てに使わない**（{@link describeFailure} 参照）。
 */
function runOrca(args: readonly string[], label: string): Promise<CommandOutput> {
  return new Promise((resolve) => {
    execFile(ORCA_COMMAND, [...args], { encoding: "utf8" }, (error, stdout) => {
      if (error === null) {
        resolve({ ok: true, stdout })
        return
      }

      resolve({ ok: false, reason: describeFailure(label, error) })
    })
  })
}

/**
 * 失敗の理由を、**呼び出し側が渡した固定の `label` と、失敗した事実だけ**で組み立てる。
 *
 * **`error.message` / `error.cmd`（Node の `execFile` が作る失敗メッセージ）は参照しない。**
 * これらには実行したコマンドライン全体が引数の値ごとそのまま入っており、`sendText` の
 * `--text`（依頼の文面。会話の内容）や `--terminal`（ID）が失敗の理由に紛れ込む経路になっていた
 * （`docs/coding-standards.md`「会話内容の扱い」— 修正前の実装で、送った依頼の文面が
 * エラー応答にそのまま返っていた不具合）。安全に使えるのは終了コード（数値）だけなので、
 * 取れるときだけ添える。
 */
function describeFailure(label: string, error: unknown): string {
  if (isRecord(error) && error.code === "ENOENT") {
    return `${ORCA_COMMAND} コマンドが見つからない`
  }

  const exitCode = isRecord(error) && typeof error.code === "number" ? error.code : undefined
  return exitCode === undefined
    ? `${ORCA_COMMAND} ${label} が失敗した`
    : `${ORCA_COMMAND} ${label} が失敗した（終了コード ${String(exitCode)}）`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
