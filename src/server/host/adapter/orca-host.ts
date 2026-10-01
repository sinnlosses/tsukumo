// ホスト依存の操作（`Host`）を Orca の CLI で実装するアダプタ。
//
// `orca` コマンドを呼ぶのはこのファイルだけ（この境界は検査が落とす）。
// 実際に Orca が動いていないと showView などの挙動そのものは確かめられないので、ここは（境界のテストを除き）自動テストの対象にしない。
//
// Orca CLI の対応関係（v1.4.x で実測。`orca tab goto` は無い）:
//   showView → orca tab list --json でオリジンとパスが同じタブを探し、
//              あれば orca goto --url <新しい URL> --page <pageId> --json、
//              無ければ orca tab create --url <url> --json
//   openFile → orca file open <path> --json（行番号を渡す引数は無い）。
//              `--worktree` は省き、cwd から作業ツリーを推してもらう。
//              tsukumo は起こしたディレクトリでそのまま動くので、この execFile の cwd（既定は tsukumo 自身の process.cwd()）がそのまま合う（`orca agent-context --json` で実測）。
//
// URL のクエリを見比べないのは、起動ごとにトークンが変わるため（`?t=<起動トークン>`）。同じ場所を指すタブは貼り直して1つに保つ。
// `goto` が `ok: false` を返しても `tab create` に倒さない（読み込みに失敗しても遷移自体は起きており、倒すとタブが増える）。
// 開き直すのは一覧にそのタブが無かったときだけ。

import { execFile } from "node:child_process"

import { isObjectType } from "remeda"

import type { Host, HostResult } from "../core/host.ts"
import { type OrcaTab, parseOrcaCreatedPageId, parseOrcaTabList } from "./orca-tab.ts"

const ORCA_COMMAND = "orca"

/** `orca` コマンド1回に許す時間。応答しない `orca` を待ち続けないための上限。 */
const ORCA_COMMAND_TIMEOUT_MS = 5_000

/** Orca のアダプタを作る。`orca` が入っていない環境でも、失敗を返すだけで例外は投げない。 */
export function createOrcaHost(): Host {
  return { showView: (url) => showView(url), openFile: (path) => openFile(path) }
}

export type { OrcaTab } from "./orca-tab.ts"

/**
 * タブを一覧する。
 * `"all"` はすべての作業ツリーのタブ（`--worktree` を付けないと今の作業ツリーのタブしか返らない）、`{ worktreePath }` はその作業ツリーのタブだけ。
 *
 * `"all"` は、しばらく表示していない作業ツリーのタブを落とすことがある（止まっているページは一覧に出ないか、`url` が空で出る）。
 * 作業ツリーを名指しして聞くとそのページが起き、何度か聞き直すうちに `url` が埋まる。
 * 一覧が取れない・形が想定と違う要素は境界で弾く。
 */
export async function listTabs(
  scope: "all" | { readonly worktreePath: string },
): Promise<
  | { readonly ok: true; readonly tabs: readonly OrcaTab[] }
  | { readonly ok: false; readonly reason: string }
> {
  const worktree = scope === "all" ? "all" : `path:${scope.worktreePath}`
  const listed = await runOrca(
    ["tab", "list", "--worktree", worktree, "--json"],
    "タブ一覧を取得する",
  )
  if (!listed.ok) {
    return { ok: false, reason: listed.reason }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(listed.stdout)
  } catch {
    return { ok: false, reason: "タブ一覧の JSON を読めない" }
  }

  return { ok: true, tabs: parseOrcaTabList(parsed) }
}

/** 新しいタブを開き、そのページIDを返す。 */
export async function openTab(
  url: string,
): Promise<
  { readonly ok: true; readonly pageId: string } | { readonly ok: false; readonly reason: string }
> {
  const created = await runOrca(["tab", "create", "--url", url, "--json"], "タブを開く")
  if (!created.ok) {
    return { ok: false, reason: created.reason }
  }

  const pageId = parseOrcaCreatedPageId(parseJson(created.stdout))
  return pageId === undefined
    ? { ok: false, reason: "作ったタブのページIDを読めない" }
    : { ok: true, pageId }
}

/** ページIDを名指ししてタブを閉じる。 */
export async function closeTab(pageId: string): Promise<HostResult> {
  const result = await runOrca(["tab", "close", "--page", pageId, "--json"], "タブを閉じる")
  return result.ok ? { ok: true } : { ok: false, reason: result.reason }
}

/**
 * URL のビューを見せ、使い回した・新しく開いたタブのページIDを返す。
 */
export async function openOrReuseView(
  url: string,
): Promise<
  { readonly ok: true; readonly pageId: string } | { readonly ok: false; readonly reason: string }
> {
  const pageId = await findViewPageId(url)
  if (pageId !== undefined) {
    // 一覧にあったタブはそのまま使い、URL を貼り直す（トークンが変わっていても同じタブに載る）。
    const moved = await runOrca(
      ["goto", "--url", url, "--page", pageId, "--json"],
      "ビューを開き直す",
    )
    return moved.ok ? { ok: true, pageId } : { ok: false, reason: moved.reason }
  }

  return openTab(url)
}

async function showView(url: string): Promise<HostResult> {
  const result = await openOrReuseView(url)
  return result.ok ? { ok: true } : { ok: false, reason: result.reason }
}

/**
 * ファイルを1つ、Orca のエディタで開く。`--worktree` は省く（cwd から作業ツリーを推してもらう）。
 * `path` が git 管理下にあるかどうかはここでは検証しない（呼び出し側が確かめてから渡す）。
 */
async function openFile(path: string): Promise<HostResult> {
  const opened = await runOrca(["file", "open", path, "--json"], "ファイルを開く")
  return opened.ok ? { ok: true } : { ok: false, reason: opened.reason }
}

/**
 * 同じビューを開いているタブのページIDを探す。比べるのはオリジンとパスだけで、クエリ（`?t=<起動トークン>`）は見ない。
 * 一覧が取れない・形が想定と違うときは undefined を返し、新しく開く側に倒す（推測で壊れた ID を渡さない）。
 */
async function findViewPageId(url: string): Promise<string | undefined> {
  const listed = await runOrca(["tab", "list", "--json"], "タブ一覧を取得する")
  if (!listed.ok) {
    return undefined
  }

  const wanted = viewLocation(url)
  return parseOrcaTabList(parseJson(listed.stdout)).find((tab) => viewLocation(tab.url) === wanted)
    ?.pageId
}

/** JSON として読めなければ undefined にする。 */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/**
 * タブが同じビューを指しているかを比べるための鍵（オリジン + パス）。
 * URL として読めない値はそのまま返し、文字列一致に倒す（比べられない値で他のタブを掴まない）。
 */
function viewLocation(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return url
  }
}

type CommandOutput =
  | { readonly ok: true; readonly stdout: string }
  | { readonly ok: false; readonly reason: string }

/**
 * `orca` を1回呼ぶ。`label` は失敗したときの理由に使う、値を含まない固定の日本語。
 * `args` 自体は理由の組み立てに使わない（{@link describeFailure}）。
 */
function runOrca(args: readonly string[], label: string): Promise<CommandOutput> {
  return new Promise((resolve) => {
    execFile(
      ORCA_COMMAND,
      [...args],
      { encoding: "utf8", timeout: ORCA_COMMAND_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ ok: true, stdout })
          return
        }

        resolve({ ok: false, reason: describeFailure(label, error, `${stdout}\n${stderr}`) })
      },
    )
  })
}

/**
 * orca が返すエラーコードだけを取り出す。`terminal_handle_stale` のような小文字・数字・アンダースコアだけの短い1語という形に限る。
 *
 * 形で許可しているのは、会話の内容と形が違うから（日本語・空白・記号・改行を含むものは通らない）。
 * 出力を素通しにせずに、まだ表に無い失敗でも利用者が検索できる手掛かりを残すため。
 * 表（{@link KNOWN_ORCA_FAILURES}）に載ったものは日本語の説明が優先される。
 */
function orcaErrorCode(output: string): string | undefined {
  const trimmed = output.trim()
  return /^[a-z][a-z0-9_]{2,40}$/.test(trimmed) ? trimmed : undefined
}

/**
 * `orca` が返す既知の失敗の印と、その日本語の説明。この表に載っているものだけを理由に出す。
 * 出力にも会話の内容が混ざりうるので、素通しにしない。
 */
const KNOWN_ORCA_FAILURES: readonly { readonly marker: string; readonly reason: string }[] = [
  {
    marker: "terminal_handle_stale",
    reason: "送信先のターミナルが見つからない（一覧が古くなっている）",
  },
  { marker: "Missing terminal send payload", reason: "送る中身が空" },
  {
    // 実測。claude が質問や確認を表示している間は、この経路では文字を入れられない。
    marker: "agent_prompt_blocked",
    reason: "claude が入力待ちの表示を出している間は送れない（ターミナル側で答える）",
  },
]

/**
 * 失敗の理由を、呼び出し側が渡した固定の `label` と、失敗した事実だけで組み立てる。
 *
 * `error.message` / `error.cmd`（Node の `execFile` が作る失敗メッセージ）は参照しない。
 * これらには実行したコマンドライン全体が引数の値ごとそのまま入っており、引数に載せた値（URL の起動トークン・パス・文面）が失敗の理由に紛れ込む。
 * 安全に使えるのは終了コード（数値）だけなので、取れるときだけ添える。
 *
 * 例外は {@link KNOWN_ORCA_FAILURES} に載せた印だけで、これは orca 自身が返す固定の文言（会話の内容ではない）と分かっているものに限る。
 * 利用者が自力で直せる失敗（一覧が古い等）を「終了コード 1」とだけ伝えても手の打ちようがないため。
 */
function describeFailure(label: string, error: unknown, output: string): string {
  // 捕まえた例外は Error の実体（`node:child_process` が投げる）なので、`isPlainObject` では弾かれる。
  // prototype を問わない `isObjectType` で見て、`code` があるときだけ読む。
  if (isObjectType(error) && "code" in error && error.code === "ENOENT") {
    return `${ORCA_COMMAND} コマンドが見つからない`
  }

  const known = KNOWN_ORCA_FAILURES.find((failure) => output.includes(failure.marker))
  if (known !== undefined) {
    return known.reason
  }

  const code = orcaErrorCode(output)
  if (code !== undefined) {
    return `${ORCA_COMMAND} ${label} が失敗した（${code}）`
  }

  const exitCode =
    isObjectType(error) && "code" in error && typeof error.code === "number"
      ? error.code
      : undefined
  return exitCode === undefined
    ? `${ORCA_COMMAND} ${label} が失敗した`
    : `${ORCA_COMMAND} ${label} が失敗した（終了コード ${String(exitCode)}）`
}
