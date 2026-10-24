import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { astChildren, astDescendants, astObject, astString } from "./ast-node.ts"
import { importSpecifiers, listSourceFiles, parseSourceProgram, SRC_ROOT } from "./source-file.ts"

// ここから、`.oxlintrc.json` の `no-restricted-*` では表せない検査。

// `node:child_process` を起こすのはホスト（orca）・ビルド（vite build）・`git` を起こす1つの口
// （`main` の上のタスク一覧・成果の集計・git 管理下のファイルの列挙のどれもがここを使う）・
// `bd` を起こす1つの口（Beads 方式のタスク一覧と成果の集計）・別のチェックアウトの
// `bin/tsukumo` へ委ねる口・取り込んだワークフローの `bin/tw` の hook のサブコマンド（`ask-guard`・`lap-hook`）を起こす口・
// ワークフローの設定コマンド（`tw config`）を起こす口・着手中のタスクを読む `tw status --claims` を起こす口・
// Bash の出力を縮める `rtk rewrite` を起こす口の9つの境界に閉じ込める（docs/architecture/overview-and-layer.md「1ファイル = 1つの境界」）。
// そのうち `orca` コマンドを起こすのは orca-host.ts だけ、`open` コマンドを起こすのは browser-host.ts だけ。
// `execFile("orca", …)` のような呼び出しは必ずコマンド名の文字列リテラル "orca" を伴うので、その字面で探す。
// ファイル名やバッククォートで囲んだ日本語の説明文はクォートされた文字列リテラルではないので拾わない。
describe("子プロセスを起こす箇所", () => {
  it("`node:child_process` を import するのは orca-host.ts・browser-host.ts・bundle.ts・git.ts・beads.ts・checkout-launch.ts・rtk-rewrite.ts・sdk-workflow-tw.ts・tw-config.ts・tw-claim-list.ts だけで、`orca` コマンドを呼ぶのは orca-host.ts だけ、`open` コマンドを呼ぶのは browser-host.ts だけ", () => {
    const allowed = new Set([
      "server/checkout/adapter/checkout-launch.ts",
      "server/host/adapter/orca-host.ts",
      "server/host/adapter/browser-host.ts",
      "server/view-server/adapter/bundle.ts",
      "server/repository/adapter/git.ts",
      "server/repository/adapter/beads.ts",
      "server/session-driver/adapter/rtk-rewrite.ts",
      "server/session-driver/adapter/sdk-workflow-tw.ts",
      "server/workflow-setting/adapter/tw-config.ts",
      "server/token-usage/adapter/tw-claim-list.ts",
    ])
    const spawning = listSourceFiles(SRC_ROOT).filter((relPath) =>
      importSpecifiers(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")).some(
        (specifier) => specifier === "node:child_process" || specifier === "child_process",
      ),
    )

    expect(spawning.filter((relPath) => !allowed.has(relPath))).toEqual([])
    expect(
      spawning.filter((relPath) =>
        /["']orca["']/.test(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")),
      ),
    ).toEqual(["server/host/adapter/orca-host.ts"])
    expect(
      spawning.filter((relPath) =>
        /OPEN_COMMAND\s*=\s*["']open["']/.test(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")),
      ),
    ).toEqual(["server/host/adapter/browser-host.ts"])
  })
})

// 会話の中身を外へ送る経路を足せないよう、受け口は view-server の server.ts（127.0.0.1 だけに listen する）に限る。
const NETWORK_SERVER_FILE = "server/view-server/adapter/server.ts"

describe("ネットワークの口", () => {
  it("`listen` の宛先は `BIND_HOST` だけ", () => {
    const listens = listSourceFiles(SRC_ROOT).map((relPath) => ({
      relPath,
      misbound: listenWithoutBindHost(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")),
    }))

    expect(listens.filter((entry) => entry.misbound).map((entry) => entry.relPath)).toEqual([])
    expect(
      listens.some(
        (entry) =>
          entry.relPath === NETWORK_SERVER_FILE &&
          /\.listen\(/.test(readFileSync(`${SRC_ROOT}/${entry.relPath}`, "utf8")),
      ),
    ).toBe(true)
  })

  it("`listen` は第2引数が `BIND_HOST` でなければ拾う", () => {
    expect(listenWithoutBindHost("server.listen(port, BIND_HOST, cb)")).toBe(false)
    expect(listenWithoutBindHost('server.listen(port, "0.0.0.0", cb)')).toBe(true)
    expect(listenWithoutBindHost("server.listen(port, cb)")).toBe(true)
    expect(listenWithoutBindHost("server.listen(port)")).toBe(true)
    expect(listenWithoutBindHost("const a = 1")).toBe(false)
  })
})

// `.oxlintrc.json` の `process.env`・`process.cwd` の禁止は、`process` という名前で読む形だけを拾う。
// 別名（`import p from "node:process"`）や名前空間の import を通すと禁止が素通りするので、名前を縛る。
describe("process の import", () => {
  it("`process` は `process` という名前で import する", () => {
    const offenders = listSourceFiles(SRC_ROOT).filter((relPath) =>
      importsProcessUnderOtherName(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")),
    )

    expect(offenders).toEqual([])
  })

  it("別名と名前空間の import は拾い、`process` の名前のものと名前付き import は拾わない", () => {
    expect(importsProcessUnderOtherName('import p from "node:process"')).toBe(true)
    expect(importsProcessUnderOtherName('import p from "process"')).toBe(true)
    expect(importsProcessUnderOtherName('import * as p from "node:process"')).toBe(true)

    expect(importsProcessUnderOtherName('import process from "node:process"')).toBe(false)
    expect(importsProcessUnderOtherName('import { argv } from "node:process"')).toBe(false)
    expect(importsProcessUnderOtherName('import p from "node:path"')).toBe(false)
  })
})

function importsProcessUnderOtherName(content: string): boolean {
  return astDescendants(parseSourceProgram(content)).some(
    (node) =>
      astString(node, "type") === "ImportDeclaration" &&
      ["node:process", "process"].includes(astString(astObject(node, "source"), "value") ?? "") &&
      astChildren(node, "specifiers").some(
        (specifier) =>
          astString(specifier, "type") !== "ImportSpecifier" &&
          astString(astObject(specifier, "local"), "name") !== "process",
      ),
  )
}

/** 第2引数が識別子 `BIND_HOST` でない `.listen(…)` の呼び出しがあるか。 */
function listenWithoutBindHost(content: string): boolean {
  return astDescendants(parseSourceProgram(content)).some((node) => {
    if (astString(node, "type") !== "CallExpression") {
      return false
    }
    const callee = astObject(node, "callee")
    if (
      astString(callee, "type") !== "MemberExpression" ||
      astString(astObject(callee, "property"), "name") !== "listen"
    ) {
      return false
    }
    const host = astChildren(node, "arguments")[1]
    return !(astString(host, "type") === "Identifier" && astString(host, "name") === "BIND_HOST")
  })
}
