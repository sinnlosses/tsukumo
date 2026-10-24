// 名前やパターンでプロセスを薙ぎ払う `kill` の形を、構文解析した argv から見つける。
// 辿れない形（変数の pid・読めない入れ子）は通す。拒むのは、辿れた argv が確かに該当するものだけ。

import type { BashDenial } from "./bash-denial.ts"
import type { BashHookCall } from "./bash-hook-call.ts"
import { baseName, parseShellCommand, stripPrefixes } from "./shell-command.ts"
import type { ShellWord, SimpleCommand } from "./shell-command.ts"

/** `xargs` のオプションのうち、次の語を値として取るもの。 */
const XARGS_VALUE_OPTIONS: ReadonlySet<string> = new Set([
  "-n",
  "-I",
  "-i",
  "-P",
  "-L",
  "-l",
  "-E",
  "-d",
  "-s",
  "-a",
  "-J",
])

/** pid を名前やパターンから引くコマンド。 */
const NAME_LOOKUP_COMMANDS: ReadonlySet<string> = new Set(["pgrep", "pidof", "ps", "pkill"])

type Launched = {
  readonly argv: readonly ShellWord[]
  readonly viaXargs: boolean
}

const REFUSAL = `この作業ツリーでは複数の tsukumo が同時に動いている。どれも \`node src/cli.ts\` として見えるので、
名前やパターンで止めると利用者が使っている本体まで落ちる（docs/workflow.md「起こすときの作法」）。

代わりに、止める相手を1つに絞ること:

  node scripts/runtime/stop.ts                 # いま動いている tsukumo を一覧する（止めない）
  node scripts/runtime/stop.ts --port 7398     # そのポートで待っているものだけ止める

背景シェルで起こしたなら、そのシェルごと止める（KillShell）のがいちばん確実。
pid が分かっているなら kill <pid> はそのまま使える。
分からなければ ps で PID を確かめてから kill <PID> で止める。`

/** 名前やパターンで薙ぎ払う `kill` なら拒否を返す。pid を名指しする `kill` は通す。 */
export function findBroadKillDenial(call: BashHookCall): BashDenial | undefined {
  const rule = findBroadKillRule(call.command)
  return rule === undefined ? undefined : { hook: "deny-broad-kill", rule, refusal: REFUSAL }
}

/** 規則のキー。`pkill` / `killall` はコマンドの位置にあるだけで拒み、`kill` は pid を名前から引くときだけ拒む。 */
function findBroadKillRule(bashCommand: string): string | undefined {
  const commands = parseShellCommand(bashCommand)
  for (const [index, simple] of commands.entries()) {
    const launched = unwrapLauncher(simple.argv)
    const name = launched.argv[0] === undefined ? "" : baseName(launched.argv[0].text)
    if (name === "pkill" || name === "killall") {
      return "pkill-killall"
    }
    if (name !== "kill") {
      continue
    }
    if (targetsProcessGroup(launched.argv.slice(1), launched.viaXargs)) {
      return "pkill-killall"
    }
    if (killsByName(simple, launched, isFedByPortLookup(commands, index))) {
      return "pgrep-piped-kill"
    }
  }
  return undefined
}

/** pid に負の数(`-1` は利用者の全プロセス、`-<pgid>` はプロセスグループ)を渡しているか。引数が `-<数字>` 1 つだけの形も含む。 */
function targetsProcessGroup(args: readonly ShellWord[], viaXargs: boolean): boolean {
  const texts = args.map((word) => word.text)
  const separatorAt = texts.indexOf("--")
  if (separatorAt >= 0) {
    return texts.slice(separatorAt + 1).some(isNegativePid)
  }
  const [only] = texts
  if (!viaXargs && texts.length === 1 && only !== undefined && isNegativePid(only)) {
    return true
  }
  let index = 0
  if (texts[index] === "-s" || texts[index] === "-n") {
    index += 2
  } else if (/^-[A-Za-z0-9]+$/.test(texts[index] ?? "")) {
    index += 1
  }
  return texts.slice(index).some(isNegativePid)
}

function isNegativePid(text: string): boolean {
  return /^-\d+$/.test(text)
}

/** `index` のコマンドへ流し込む同じパイプラインの前段に、待受ポートで絞った `lsof` があるか。 */
function isFedByPortLookup(commands: readonly SimpleCommand[], index: number): boolean {
  const upstream: SimpleCommand[] = []
  let head = index
  while (commands[head]?.pipedIn === true) {
    let previous = head - 1
    while (commands[previous]?.substituted === true) {
      previous -= 1
    }
    const stage = commands[previous]
    if (stage === undefined) {
      break
    }
    upstream.push(stage)
    head = previous
  }
  return upstream.some(isListeningPortLookup)
}

/** `env` / `sudo` などと `xargs` を外して、実際に起こされるコマンドの argv にする。 */
function unwrapLauncher(argv: readonly ShellWord[]): Launched {
  const stripped = stripPrefixes(argv)
  const [first, ...rest] = stripped
  if (first === undefined || baseName(first.text) !== "xargs") {
    return { argv: stripped, viaXargs: false }
  }
  let index = 0
  while (index < rest.length && (rest[index]?.text ?? "").startsWith("-")) {
    index += XARGS_VALUE_OPTIONS.has(rest[index]?.text ?? "") ? 2 : 1
  }
  return { argv: unwrapLauncher(rest.slice(index)).argv, viaXargs: true }
}

function killsByName(simple: SimpleCommand, launched: Launched, fedByPortLookup: boolean): boolean {
  const args = launched.argv.slice(1)
  if (launched.viaXargs) {
    const hasExplicitPid = args.some((word) => /^\d+$/.test(word.text))
    return simple.pipedIn && !hasExplicitPid && !fedByPortLookup
  }
  return args.some((word) => word.expanded && substitutesNameLookup(word.text))
}

/** 語の中のコマンド置換が、pid を名前から引いているか。 */
function substitutesNameLookup(wordText: string): boolean {
  if (!wordText.includes("$(") && !wordText.includes("`")) {
    return false
  }
  const inner = wordText.replaceAll("$(", " ").replaceAll(")", " ").replaceAll("`", " ")
  return parseShellCommand(inner).some((simple) => {
    const name = simple.argv[0] === undefined ? "" : baseName(simple.argv[0].text)
    return NAME_LOOKUP_COMMANDS.has(name)
  })
}

/** `lsof … tcp:<port> … -sTCP:LISTEN` のように、待受ポートで 1 つに絞って pid を引くコマンドか。 */
function isListeningPortLookup(simple: SimpleCommand): boolean {
  const [name, ...args] = simple.argv
  if (name === undefined || baseName(name.text) !== "lsof") {
    return false
  }
  return (
    args.some((word) => word.text === "-sTCP:LISTEN") &&
    args.some((word) => /:\d+$/.test(word.text))
  )
}
