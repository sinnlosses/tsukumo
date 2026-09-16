// ホスト依存の操作（src/core/host.ts）を Orca の CLI で実装するアダプタ。
//
// **`orca` コマンドを呼ぶのはこのファイルだけ**（docs/architecture.md 原則3）。
// この境界は test/architecture.test.ts が落とす。
// 実際に Orca が動いていないと showView などの挙動そのものは確かめられないので、
// ここは（境界のテストを除き）自動テストの対象にしない。
//
// Orca CLI の対応関係（2026-09-13 に v1.4.x で実測。**`orca tab goto` は無い**）:
//   showView → orca tab list --json で**オリジンとパスが同じ**タブを探し、
//              あれば orca goto --url <新しい URL> --page <pageId> --json、
//              無ければ orca tab create --url <url> --json
//
// **URL のクエリを見比べないのは、起動ごとにトークンが変わるため**（`?t=<起動トークン>`。
// docs/design.md 9章）。同じ場所を指すタブは貼り直して1つに保つ。
// **`goto` が `ok: false` を返しても `tab create` に倒さない**（読み込みに失敗しても遷移自体は
// 起きており、倒すとタブが増える。2026-09-13 実測）。開き直すのは一覧にそのタブが無かったときだけ。

import { execFile } from "node:child_process"

import { type Host, type HostResult } from "../core/host.ts"

const ORCA_COMMAND = "orca"

/** Orca のアダプタを作る。`orca` が入っていない環境でも、失敗を返すだけで例外は投げない。 */
export function createOrcaHost(): Host {
  return { showView: (url) => showView(url) }
}

async function showView(url: string): Promise<HostResult> {
  const pageId = await findViewPageId(url)
  if (pageId !== undefined) {
    // 一覧にあったタブはそのまま使い、URL を貼り直す（トークンが変わっていても同じタブに載る）。
    const moved = await runOrca(
      ["goto", "--url", url, "--page", pageId, "--json"],
      "ビューを開き直す",
    )
    return moved.ok ? { ok: true } : { ok: false, reason: moved.reason }
  }

  const created = await runOrca(["tab", "create", "--url", url, "--json"], "ビューを開く")
  return created.ok ? { ok: true } : { ok: false, reason: created.reason }
}

/**
 * 同じビューを開いているタブのページIDを探す。**比べるのはオリジンとパスだけ**で、クエリ
 * （`?t=<起動トークン>`）は見ない。一覧が取れない・形が想定と違うときは undefined を返し、
 * 呼び出し側で新しく開く側に倒す（推測で壊れた ID を渡さない）。
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

  const wanted = viewLocation(url)
  const tabs: readonly unknown[] = value.result.tabs
  for (const tab of tabs) {
    if (
      isRecord(tab) &&
      typeof tab.url === "string" &&
      viewLocation(tab.url) === wanted &&
      typeof tab.browserPageId === "string"
    ) {
      return tab.browserPageId
    }
  }

  return undefined
}

/**
 * タブが同じビューを指しているかを比べるための鍵（オリジン + パス）。URL として読めない値は
 * そのまま返し、文字列一致に倒す（比べられない値で他のタブを掴まない）。
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
 * `orca` を1回呼ぶ。`label` は失敗したときの理由に使う、値を含まない固定の日本語（「ターミナルへ
 * 送信する」など）。**`args` 自体は理由の組み立てに使わない**（{@link describeFailure} 参照）。
 */
function runOrca(args: readonly string[], label: string): Promise<CommandOutput> {
  return new Promise((resolve) => {
    execFile(ORCA_COMMAND, [...args], { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error === null) {
        resolve({ ok: true, stdout })
        return
      }

      resolve({ ok: false, reason: describeFailure(label, error, `${stdout}\n${stderr}`) })
    })
  })
}

/**
 * `orca` が返す**既知の**失敗の印と、その日本語の説明。**この表に載っているものだけを理由に
 * 出す**（出力にも会話の内容が混ざりうるので、素通しにしない。`docs/coding-standards.md`
 * 「会話内容の扱い」）。表に無い出力は、これまでどおり終了コードだけを伝える。
 */
/**
 * orca が返す**エラーコードだけ**を取り出す。`terminal_handle_stale` のような
 * **小文字・数字・アンダースコアだけの短い1語**という形に限る。
 *
 * **形で許可しているのは、会話の内容と形が違うから**（日本語・空白・記号・改行を含むものは
 * 通らない）。`docs/coding-standards.md`「会話内容の扱い」を守りつつ、まだ表に無い失敗でも
 * 利用者が検索できる手掛かりを残すための折衷。表（{@link KNOWN_ORCA_FAILURES}）に載ったものは
 * 日本語の説明が優先される。
 */
function orcaErrorCode(output: string): string | undefined {
  const trimmed = output.trim()
  return /^[a-z][a-z0-9_]{2,40}$/.test(trimmed) ? trimmed : undefined
}

const KNOWN_ORCA_FAILURES: readonly { readonly marker: string; readonly reason: string }[] = [
  {
    marker: "terminal_handle_stale",
    reason: "送信先のターミナルが見つからない（一覧が古くなっている）",
  },
  { marker: "Missing terminal send payload", reason: "送る中身が空" },
  {
    // 2026-09-11 実測。claude が質問や確認を表示している間は、この経路では文字を入れられない。
    marker: "agent_prompt_blocked",
    reason: "claude が入力待ちの表示を出している間は送れない（ターミナル側で答える）",
  },
]

/**
 * 失敗の理由を、**呼び出し側が渡した固定の `label` と、失敗した事実だけ**で組み立てる。
 *
 * **`error.message` / `error.cmd`（Node の `execFile` が作る失敗メッセージ）は参照しない。**
 * これらには実行したコマンドライン全体が引数の値ごとそのまま入っており、`sendText` の
 * `--text`（依頼の文面。会話の内容）や `--terminal`（ID）が失敗の理由に紛れ込む経路になっていた
 * （`docs/coding-standards.md`「会話内容の扱い」— 修正前の実装で、送った依頼の文面が
 * エラー応答にそのまま返っていた不具合）。安全に使えるのは終了コード（数値）だけなので、
 * 取れるときだけ添える。
 *
 * **例外は {@link KNOWN_ORCA_FAILURES} に載せた印だけ**で、これは orca 自身が返す固定の文言
 * （会話の内容ではない）と分かっているものに限る。利用者が自力で直せる失敗（一覧が古い等）を
 * 「終了コード 1」とだけ伝えても手の打ちようがないため。
 */
function describeFailure(label: string, error: unknown, output: string): string {
  if (isRecord(error) && error.code === "ENOENT") {
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

  const exitCode = isRecord(error) && typeof error.code === "number" ? error.code : undefined
  return exitCode === undefined
    ? `${ORCA_COMMAND} ${label} が失敗した`
    : `${ORCA_COMMAND} ${label} が失敗した（終了コード ${String(exitCode)}）`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
