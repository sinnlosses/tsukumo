// 同じマシンで動いている他のセッションの tsukumo を巻き込む `kill` を、実行される前に止める
// Claude Code の PreToolUse hook（`.claude/settings.json` から Bash ツールに掛かる）。
//
// **止める理由は、プロセスのコマンドラインで見分けが付かないこと。** 手元で複数の tsukumo を
// 並べて動かすと、どれも `bun run src/cli.ts` として見える（`bun run dev` 経由でも同じ）。
// そのため `pkill -f 'bun run'` はもちろん `pkill -f 'src/cli.ts'` でも、自分が起こした
// 検証用のインスタンスではなく**利用者が使っている本体まで落ちる**。
// `docs/workflow.md`「起こすときの作法」が文章で禁じていた事故を、ここで機構として塞ぐ。
//
// 拒否するのは「名前やパターンで薙ぎ払う形」だけで、**pid を名指しする `kill` は通す**
// （`kill $(lsof -ti tcp:7398 -sTCP:LISTEN)` は狙いが1つに定まっているので安全）。
//
// hook の約束: 終了コード 2 で Bash の実行を止め、stderr の中身がモデルへ返る。
// それ以外の終了コードでは実行を止めない（**判定に失敗したときは通す**。開発の手を
// 止めないほうを既定にする）。

import process from "node:process"

/** 名前やパターンでまとめて薙ぎ払うコマンド。コマンドの位置に現れたときだけ拾う。 */
const BROAD_KILL_COMMAND = /(?:^|[;&|(]\s*|\n)\s*(?:sudo\s+)?(?:pkill|killall)\b/

/** `pgrep` で引いた pid をそのまま `kill` へ流し込む形（`pkill` と実質同じ）。 */
const PGREP_PIPED_TO_KILL = /(?:^|[;&|(]\s*|\n)\s*(?:sudo\s+)?pgrep\b[^\n]*\|[^\n]*\bkill\b/

/**
 * 他のセッションと取り合う対象。**この語のどれかを狙っているときだけ拒否する**ので、
 * 無関係なプロセス（自分で起こした python など）を名前で止めるのは妨げない。
 */
const SHARED_PROCESS = /\b(?:bun|node|tsukumo|claude|cli\.ts|vite)\b/

const REFUSAL = `この作業ツリーでは複数の tsukumo が同時に動いている。どれも \`bun run src/cli.ts\` として見えるので、
名前やパターンで止めると利用者が使っている本体まで落ちる（docs/workflow.md「起こすときの作法」）。

代わりに、止める相手を1つに絞ること:

  bun run scripts/stop.ts                 # いま動いている tsukumo を一覧する（止めない）
  bun run scripts/stop.ts --port 7398     # そのポートで待っているものだけ止める

背景シェルで起こしたなら、そのシェルごと止める（KillShell）のがいちばん確実。
pid が分かっているなら kill <pid> はそのまま使える。`

/** Bash ツールの入力のうち、この hook が見るところ。 */
type BashHookInput = {
  readonly tool_name?: unknown
  readonly tool_input?: { readonly command?: unknown }
}

const raw = await readStdin()
const command = readBashCommand(raw)
if (command !== undefined && isBroadKill(command)) {
  process.stderr.write(`${REFUSAL}\n`)
  process.exit(2)
}

/**
 * 他のセッションを巻き込む形の `kill` か。**コマンドの位置**に `pkill` / `killall` が
 * 現れ、かつ取り合う対象を狙っているときだけ真になる
 * （`grep pkill docs/workflow.md` のように語として書いただけのものは通す）。
 */
function isBroadKill(bashCommand: string): boolean {
  if (!SHARED_PROCESS.test(bashCommand)) {
    return false
  }
  return BROAD_KILL_COMMAND.test(bashCommand) || PGREP_PIPED_TO_KILL.test(bashCommand)
}

/** hook が stdin へ流す JSON から Bash のコマンド文字列を取り出す。形が違えば `undefined`。 */
function readBashCommand(rawInput: string): string | undefined {
  const parsed: unknown = safeParse(rawInput)
  if (typeof parsed !== "object" || parsed === null) {
    return undefined
  }

  const input = parsed as BashHookInput
  if (input.tool_name !== "Bash") {
    return undefined
  }

  const bashCommand = input.tool_input?.command
  return typeof bashCommand === "string" ? bashCommand : undefined
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
