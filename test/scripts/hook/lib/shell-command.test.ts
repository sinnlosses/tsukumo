// 前置きの語(nice・timeout・pnpm exec など)を外した実コマンドの argv を、parseShellCommand 越しに確かめる。

import { describe, expect, test } from "vitest"

import { parseShellCommand } from "../../../../scripts/hook/lib/shell-command.ts"

function argvOf(command: string): readonly string[] {
  return (parseShellCommand(command)[0]?.argv ?? []).map((word) => word.text)
}

describe("前置きを外した argv", () => {
  test.each([
    ["nice -n5", "nice -n5 tw verify"],
    ["nice -n 5", "nice -n 5 tw verify"],
    ["nice --adjustment=5", "nice --adjustment=5 tw verify"],
    ["nice --adjustment 5", "nice --adjustment 5 tw verify"],
    ["nice -5", "nice -5 tw verify"],
    ["timeout の秒", "timeout 600 tw verify"],
    ["timeout -k", "timeout -k 10 600 tw verify"],
    ["timeout --signal=KILL", "timeout --signal=KILL 600 tw verify"],
    ["timeout --signal KILL", "timeout --signal KILL 600 tw verify"],
    ["pnpm exec", "pnpm exec tw verify"],
    ["pnpm exec --", "pnpm exec -- tw verify"],
    ["重ねた前置き", "env A=1 nice -n5 timeout 600 pnpm exec tw verify"],
  ])("%s を外す", (_name, command) => {
    expect(argvOf(command)).toEqual(["tw", "verify"])
  })

  test.each([
    ["sudo -u", "sudo -u x tw verify"],
    ["sudo --user", "sudo --user x tw verify"],
    ["env -u", "env -u FOO tw verify"],
    ["env -C", "env -C /tmp A=1 tw verify"],
  ])("値を取るオプションの値を実コマンドと読まない: %s", (_name, command) => {
    expect(argvOf(command)).toEqual(["tw", "verify"])
  })

  test("前置きでない pnpm のサブコマンドは外さない", () => {
    expect(argvOf("pnpm run check")).toEqual(["pnpm", "run", "check"])
  })
})
