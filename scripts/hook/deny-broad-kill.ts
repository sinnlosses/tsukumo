// 同じマシンで動いている他のセッションの tsukumo を巻き込む `kill` を、実行される前に止める
// Claude Code の PreToolUse hook（`.claude/settings.json` から Bash ツールに掛かる）。
//
// 止める理由は、プロセスのコマンドラインで見分けが付かないこと。 手元で複数の tsukumo を
// 並べて動かすと、どれも同じ `node` の起動コマンドとして見える（`pnpm run dev` 経由でも同じ）。
// そのため名前やパターンで止める `pkill` / `killall` は、狙う語によらず、
// 自分が起こした検証用のインスタンスではなく利用者が使っている本体まで落としうる。
// `docs/workflow.md`「起こすときの作法」が文章で禁じていた事故を、ここで機構として塞ぐ。
//
// 拒否するのは「名前やパターンで薙ぎ払う形」だけで、pid を名指しする `kill` は通す
// （`kill $(lsof -ti tcp:7398 -sTCP:LISTEN)` は狙いが1つに定まっているので安全）。
//
// hook の約束: 終了コード 2 で Bash の実行を止め、stderr の中身がモデルへ返る。
// それ以外の終了コードでは実行を止めない（判定に失敗したときは通す。開発の手を
// 止めないほうを既定にする）。

import { findBroadKillRule } from "./lib/broad-kill.ts"
import { denyBashCall, readBashHookCall } from "./lib/hook-input.ts"

const REFUSAL = `この作業ツリーでは複数の tsukumo が同時に動いている。どれも \`node src/cli.ts\` として見えるので、
名前やパターンで止めると利用者が使っている本体まで落ちる（docs/workflow.md「起こすときの作法」）。

代わりに、止める相手を1つに絞ること:

  node scripts/runtime/stop.ts                 # いま動いている tsukumo を一覧する（止めない）
  node scripts/runtime/stop.ts --port 7398     # そのポートで待っているものだけ止める

背景シェルで起こしたなら、そのシェルごと止める（KillShell）のがいちばん確実。
pid が分かっているなら kill <pid> はそのまま使える。
分からなければ ps で PID を確かめてから kill <PID> で止める。`

const call = await readBashHookCall()
const rule = call === undefined ? undefined : findBroadKillRule(call.command)
if (call !== undefined && rule !== undefined) {
  denyBashCall(call, { hook: "deny-broad-kill", rule, refusal: REFUSAL })
}
