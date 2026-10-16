// 広い kill の判定（構文解析した argv が確かに該当するものだけを拒む）を、入力の文字列だけで確かめる。
// hook を起こさないので拒否記録は書かず、本物の pkill も走らない。

import { describe, expect, test } from "vitest"

import { findBroadKillRule } from "../../../scripts/hook/lib/broad-kill.ts"

describe("findBroadKillRule", () => {
  test.each([
    ["bash -c の中", 'bash -c "pkill -f node"'],
    ["sh -lc の中", "sh -lc 'killall node'"],
    ["env 越し", "env pkill -f node"],
    ["env に変数を渡して", "env FOO=1 pkill node"],
    ["sudo 越し", "sudo pkill node"],
    ["xargs 越し", "pgrep -f node | xargs pkill"],
    ["パスを付けた pkill", "/usr/bin/pkill -f node"],
    ["パスを付けた killall", "/usr/bin/killall node"],
    ["入れ子の $() の中", "echo $(pkill -f node)"],
    ["&& の後ろ", "echo stopping && pkill -f tsukumo"],
    ["取り合う語を含まない相手でも", "pkill -f my-python-worker"],
  ])("%s の pkill / killall は拒む", (_name, command) => {
    expect(findBroadKillRule(command)).toBe("pkill-killall")
  })

  test.each([
    ["pgrep の $() を渡す kill", "kill $(pgrep -f node)"],
    ["シグナルを付けた同じ形", "kill -9 $(pgrep -f node)"],
    ["バッククォートの pgrep", "kill `pgrep -f node`"],
    ["ps の結果を引く kill", "kill $(ps aux | grep node | awk '{print $2}')"],
    ["pgrep を xargs kill へ流す", "pgrep -f node | xargs kill"],
    ["ps aux | grep から xargs kill", "ps aux | grep node | xargs kill -9"],
    ["xargs にオプションを付けて", "pgrep -f node | xargs -r kill"],
    ["bash -c の中の pgrep kill", `bash -c 'kill $(pgrep -f node)'`],
  ])("%s は名前から引いた kill として拒む", (_name, command) => {
    expect(findBroadKillRule(command)).toBe("pgrep-piped-kill")
  })

  test.each([
    ["-I {} の置換文字列を使う xargs kill", "pgrep node | xargs -I{} kill {}"],
    ["-I PID の置換文字列を使う xargs kill", "pgrep node | xargs -I PID kill PID"],
    ["別の文の lsof は数えない", "lsof -ti tcp:7398 -sTCP:LISTEN; pgrep node | xargs kill"],
    [
      "パイプの段でなく引数の置換の中の lsof は数えない",
      "pgrep node | grep -v $(lsof -ti tcp:7398 -sTCP:LISTEN) | xargs kill",
    ],
    [
      "xargs kill の引数の置換の中の lsof は数えない",
      "pgrep node | xargs kill $(lsof -ti tcp:7398 -sTCP:LISTEN)",
    ],
    ["&& の前の lsof は数えない", "lsof -ti tcp:7398 -sTCP:LISTEN && pgrep node | xargs kill"],
  ])("%s は名前から引いた kill として拒む", (_name, command) => {
    expect(findBroadKillRule(command)).toBe("pgrep-piped-kill")
  })

  test.each([
    ["sudo -u 越し", "sudo -u x pkill node"],
    ["sudo --user 越し", "sudo --user x pkill node"],
    ["env -u 越し", "env -u FOO pkill node"],
    ["env -C 越し", "env -C /tmp pkill node"],
    ["env -S 越し", "env -S x pkill node"],
    ["nice -n5 越し", "nice -n5 pkill -f node"],
    ["nice -n 5 越し", "nice -n 5 pkill -f node"],
    ["timeout 越し", "timeout 5 pkill -f node"],
    ["timeout -k 越し", "timeout -k 1 5 pkill -f node"],
    ["pnpm exec 越し", "pnpm exec pkill -f node"],
    ["全プロセスを指す kill -1", "kill -1"],
    ["シグナル付きで全プロセスを指す kill", "kill -9 -1"],
    ["-- の後ろの全プロセス", "kill -- -1"],
    ["プロセスグループを指す kill", "kill -TERM -4321"],
  ])("%s は拒む", (_name, command) => {
    expect(findBroadKillRule(command)).toBe("pkill-killall")
  })

  test.each([
    ["pid を名指しする kill", "kill 34390"],
    ["シグナル付きの pid", "kill -9 34390"],
    ["名前のシグナル付きの pid", "kill -TERM 1234"],
    ["待受ポートの lsof を挟んだ xargs kill", "lsof -ti tcp:7398 -sTCP:LISTEN | sort | xargs kill"],
    ["待受ポートから引いた pid", "kill $(lsof -ti tcp:7398 -sTCP:LISTEN)"],
    ["待受ポートから引いて xargs kill", "lsof -ti tcp:7398 -sTCP:LISTEN | xargs kill"],
    ["変数の pid", "kill $PID"],
    ["pgrep 単独", "pgrep -f node"],
    ["停止の台本", "node scripts/runtime/stop.ts --port 7398"],
    ["語として書いただけの echo", "echo pkill -f node"],
    ["語として書いただけの grep", 'grep -rn "pkill" docs/workflow.md'],
    ["コミットメッセージの中", 'git commit -m "node の pkill を止める hook"'],
    ["引用符の中の kill", "echo 'kill $(pgrep node)'"],
    ["heredoc の本文", "tw new --body-file - <<'EOF'\npkill -f vitest\nkillall node\nEOF"],
    ["空のコマンド", ""],
  ])("%s は通す", (_name, command) => {
    expect(findBroadKillRule(command)).toBeUndefined()
  })
})
