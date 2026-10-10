import { describe, expect, test } from "vitest"

import { readE2eUpdateArgument } from "../../scripts/lib/e2e-update-argument.ts"

describe("readE2eUpdateArgument", () => {
  test.each([
    ["引数なし", [], { kind: "changed" }],
    ["--full", ["--full"], { kind: "full" }],
    ["--full にファイルが続く", ["--full", "test/e2e/x.test.ts"], { kind: "full" }],
    ["ファイルだけ", ["test/e2e/x.test.ts"], { kind: "files", files: ["test/e2e/x.test.ts"] }],
    ["--help", ["--help"], { kind: "help" }],
    ["-h", ["-h"], { kind: "help" }],
    ["--help と --full", ["--full", "--help"], { kind: "help" }],
    ["知らないフラグ", ["--foo"], { kind: "unknown", flags: ["--foo"] }],
    ["--full と知らないフラグ", ["--full", "--foo"], { kind: "unknown", flags: ["--foo"] }],
    ["区切りの -- は数えない", ["--"], { kind: "changed" }],
  ])("%s", (_name, args, expected) => {
    expect(readE2eUpdateArgument(args)).toEqual(expected)
  })
})
