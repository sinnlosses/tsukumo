// 同じマシンで動いている他のセッションの tsukumo を巻き込む `kill` を、実行される前に止める
// Claude Code の PreToolUse hook（`.claude/settings.json` から Bash ツールに掛かる）。
//
// 止める理由は、プロセスのコマンドラインで見分けが付かないこと。 手元で複数の tsukumo を
// 並べて動かすと、どれも同じ `node` の起動コマンドとして見える（`pnpm run dev` 経由でも同じ）。
// そのため `pkill -f 'pnpm run'` はもちろん、起動コマンドの一部を狙う `pkill` でも、
// 自分が起こした検証用のインスタンスではなく利用者が使っている本体まで落ちる。
// リポジトリの台本（`.ts` で終わる名前）と `tw` も、どの作業ツリーでも同じ名前で見えるので同じ扱いにする。
// `docs/workflow.md`「起こすときの作法」が文章で禁じていた事故を、ここで機構として塞ぐ。
//
// 拒否するのは「名前やパターンで薙ぎ払う形」だけで、pid を名指しする `kill` は通す
// （`kill $(lsof -ti tcp:7398 -sTCP:LISTEN)` は狙いが1つに定まっているので安全）。
//
// hook の約束: 終了コード 2 で Bash の実行を止め、stderr の中身がモデルへ返る。
// それ以外の終了コードでは実行を止めない（判定に失敗したときは通す。開発の手を
// 止めないほうを既定にする）。

import process from "node:process"

import { recordHookDenial } from "./lib/hook-denial-record.ts"
import { findQuotedSpans, withSpansBlanked } from "./lib/quoted-span.ts"

/** 名前やパターンでまとめて薙ぎ払うコマンド。コマンドの位置に現れたときだけ拾う。 */
const BROAD_KILL_COMMAND = /(?:^|[;&|(]\s*|\n)\s*(?:sudo\s+)?(?:pkill|killall)\b/

/** `pgrep` で引いた pid をそのまま `kill` へ流し込む形（`pkill` と実質同じ）。 */
const PGREP_PIPED_TO_KILL = /(?:^|[;&|(]\s*|\n)\s*(?:sudo\s+)?pgrep\b[^\n]*\|[^\n]*\bkill\b/

/**
 * 他のセッションと取り合う対象。この語のどれかを狙っているときだけ拒否するので、
 * 無関係なプロセス（自分で起こした python など）を名前で止めるのは妨げない。
 */
const SHARED_PROCESS =
  /\b(?:pnpm|node|tsukumo|claude|vite|vitest|playwright|chrome)\b|\.ts\b|(?<![\w-])tw(?![\w-])/i

const REFUSAL = `この作業ツリーでは複数の tsukumo が同時に動いている。どれも \`node src/cli.ts\` として見えるので、
名前やパターンで止めると利用者が使っている本体まで落ちる（docs/workflow.md「起こすときの作法」）。

代わりに、止める相手を1つに絞ること:

  node scripts/stop.ts                 # いま動いている tsukumo を一覧する（止めない）
  node scripts/stop.ts --port 7398     # そのポートで待っているものだけ止める

背景シェルで起こしたなら、そのシェルごと止める（KillShell）のがいちばん確実。
pid が分かっているなら kill <pid> はそのまま使える。
分からなければ ps で PID を確かめてから kill <PID> で止める。`

/** Bash ツールの入力のうち、この hook が見るところ。 */
type BashHookInput = {
  readonly tool_name?: unknown
  readonly tool_input?: { readonly command?: unknown }
  readonly agent_id?: unknown
}

const raw = await readStdin()
const call = readBashCall(raw)
const rule = call === undefined ? undefined : findBroadKillRule(call.command)
if (call !== undefined && rule !== undefined) {
  recordHookDenial({
    hook: "deny-broad-kill",
    rule,
    actor: call.fromSubagent ? "subagent" : "main",
  })
  process.stderr.write(`${REFUSAL}\n`)
  process.exit(2)
}

/**
 * 他のセッションを巻き込む形の `kill` の規則のキー。コマンドの位置に `pkill` / `killall` が
 * 現れ、かつ取り合う対象を狙っているときだけ返す。
 * コマンドの位置は引用符・heredoc を除いて探し、狙う対象は引用符の中（`-f "vitest run"`）も含めて探す。
 */
function findBroadKillRule(bashCommand: string): string | undefined {
  if (!SHARED_PROCESS.test(bashCommand)) {
    return undefined
  }
  const skeleton = withSpansBlanked(bashCommand, findQuotedSpans(bashCommand))
  if (BROAD_KILL_COMMAND.test(skeleton)) {
    return "pkill-killall"
  }
  return PGREP_PIPED_TO_KILL.test(skeleton) ? "pgrep-piped-kill" : undefined
}

type BashCall = {
  readonly command: string
  readonly fromSubagent: boolean
}

/** hook が stdin へ流す JSON から Bash の呼び出しを取り出す。形が違えば `undefined`。 */
function readBashCall(rawInput: string): BashCall | undefined {
  const parsed: unknown = safeParse(rawInput)
  if (typeof parsed !== "object" || parsed === null) {
    return undefined
  }

  const input = parsed as BashHookInput
  if (input.tool_name !== "Bash") {
    return undefined
  }

  const bashCommand = input.tool_input?.command
  return typeof bashCommand === "string"
    ? { command: bashCommand, fromSubagent: typeof input.agent_id === "string" }
    : undefined
}

function safeParse(rawInput: string): unknown {
  try {
    return JSON.parse(rawInput)
  } catch {
    return undefined
  }
}

async function readStdin(): Promise<string> {
  const chunks: string[] = []
  process.stdin.setEncoding("utf8")
  for await (const chunk of process.stdin) {
    chunks.push(chunk as string)
  }
  return chunks.join("")
}
