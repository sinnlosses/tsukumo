// `tw verify` を打つコマンドの判定を、入力の文字列だけで確かめる(hook は起こさない)。

import { describe, expect, test } from "vitest"

import { findBackgroundVerifyDenial } from "../../../../scripts/hook/lib/background-verify.ts"
import { bashCall } from "../../../fixture/bash-hook-call.ts"

function runsTwVerify(command: string): boolean {
  const call = bashCall(command, { fromSubagent: true, runsInBackground: true })
  return findBackgroundVerifyDenial(call) !== undefined
}

describe("runsTwVerify", () => {
  test.each([
    ["素の呼び出し", "tw verify"],
    ["前段に続く形", "cd foo && tw verify"],
    ["変数の前置き", "FOO=1 tw verify"],
    ["nice -n5", "nice -n5 tw verify"],
    ["nice -n 5", "nice -n 5 tw verify"],
    ["nice --adjustment=5", "nice --adjustment=5 tw verify"],
    ["timeout の秒", "timeout 600 tw verify"],
    ["timeout -k", "timeout -k 10 600 tw verify"],
    ["timeout --signal", "timeout --signal=KILL 600 tw verify"],
    ["timeout --signal 値を別の語で", "timeout --signal KILL 600 tw verify"],
    ["パス付きの tw", "./bin/tw verify"],
    ["pnpm exec", "pnpm exec tw verify"],
    ["bash -c", "bash -c 'tw verify'"],
    ["nice と timeout の重ね", "nice -n5 timeout 600 tw verify"],
    ["env と引数", "env FOO=1 tw verify --full"],
  ])("%s は tw verify", (_name, command) => {
    expect(runsTwVerify(command)).toBe(true)
  })

  // 構文解析に置き換える前の正規表現が実際に拒んでいた形。これが通らなくなったら弱めた実装である。
  test.each([
    ["; のあと", "a; tw verify"],
    ["改行のあと", "a\ntw verify"],
    ["括弧の中", "(tw verify)"],
    ["パイプの受け側", "a | tw verify"],
    ["引数付き", "tw verify --full"],
  ])("旧実装が拒んでいた形: %s", (_name, command) => {
    expect(runsTwVerify(command)).toBe(true)
  })

  test.each([
    ["別のサブコマンド", "tw verify-check"],
    ["別のコマンド", "pnpm run check"],
    ["語として書いただけ", "echo tw verify"],
    ["引用符の中", 'git commit -m "tw verify を直す"'],
    ["tw の別のサブコマンド", "nice -n5 tw status"],
  ])("%s は tw verify ではない", (_name, command) => {
    expect(runsTwVerify(command)).toBe(false)
  })
})
