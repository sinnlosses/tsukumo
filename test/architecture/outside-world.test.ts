import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { astChildren, astDescendants, astObject, astString, type AstNode } from "./ast-node.ts"
import { importSpecifiers, listSourceFiles, parseSourceProgram, SRC_ROOT } from "./source-file.ts"

// ここから、層の辺だけでは表せない限定の検査（`adapter` の中のどのファイルか、まで絞る）。

// SDK（`@anthropic-ai/claude-agent-sdk`）を import するのは機能の `adapter/` 直下
// （`server/<機能>/adapter/`）の `sdk-` で始まるファイルに閉じ込める（docs/architecture/overview-and-layer.md「1ファイル = 1つの境界」）。
// SDK は1つの境界だが1ファイルには収まらないので、許す先を一覧ではなく名前で決める —
// 足すファイルは名前で SDK の境界を名乗ることになり、名乗らずに import すればここで落ちる。
// import 文のクォートされた specifier だけを拾うので、バッククォートで囲んだ日本語の説明文は
// 拾わない（orca の検査と同じやり方）。
const SDK_BOUNDARY_FILE = /^server\/[^/]+\/adapter\/sdk-[^/]+\.ts$/

describe("Agent SDK を import する箇所", () => {
  it("`@anthropic-ai/claude-agent-sdk` を import するのは機能の adapter/ 直下の sdk- で始まるファイルだけ", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => !SDK_BOUNDARY_FILE.test(relPath))
      .filter((relPath) =>
        importSpecifiers(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")).includes(
          "@anthropic-ai/claude-agent-sdk",
        ),
      )

    expect(offenders).toEqual([])
  })
})

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
  it("`node:child_process` を import するのは orca-host.ts・browser-host.ts・bundle.ts・git.ts・beads.ts・checkout-launch.ts・rtk-rewrite.ts・sdk-workflow-tw.ts・tw-config.ts・tw-claims.ts だけで、`orca` コマンドを呼ぶのは orca-host.ts だけ、`open` コマンドを呼ぶのは browser-host.ts だけ", () => {
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
      "server/token-usage/adapter/tw-claims.ts",
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

// 環境変数の読み取りは配線層の1ファイルに集める（docs/coding-standards.md「外部の入力を読む
// 場所を1つにする」）。コメント中の `` `process.env` `` のような説明文は
// 拾わない（実コードの行だけを見る）。
//
// 例外は `TSUKUMO_HOME` を読む `tsukumo-home.ts` の1つだけ — ホームを使うのは adapter の
// 既定引数の中で、配線層から渡す道が無い（そのファイルの冒頭）。ここを2つに限ることで、
// 3つめが黙って増えない。
describe("process.env を読む箇所", () => {
  it("`process.env` を読むのは src/cli.ts と src/server/adapter/tsukumo-home.ts だけ", () => {
    const allowed = new Set(["cli.ts", "server/adapter/tsukumo-home.ts"])
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => !allowed.has(relPath))
      .filter((relPath) =>
        readsProcessMember(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"), "env"),
      )

    expect(offenders).toEqual([])
  })
})

// 起こしたディレクトリ（`process.cwd()`）を読むのは入口の cli.ts だけで、以降は引数で配る。
describe("process.cwd() を読む箇所", () => {
  it("`process.cwd` を読むのは src/cli.ts だけ", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => relPath !== "cli.ts")
      .filter((relPath) =>
        readsProcessMember(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"), "cwd"),
      )

    expect(offenders).toEqual([])
  })
})

// 会話の中身を外へ送る経路を足せないよう、ネットワークの口を2つに限る。
// 受け口は view-server の server.ts（127.0.0.1 だけに listen する）、呼ぶ口はブラウザの rpc-client.ts の `fetch` だけ。
// 型だけの import（`import type` と全指定子が `type` の import）は数えない。
const NETWORK_MODULES = new Set(["http", "https", "net", "tls", "dgram", "http2"])
const NETWORK_SERVER_FILE = "server/view-server/adapter/server.ts"
const FETCH_CALLER_FILE = "browser/lib/rpc-client.ts"
const USER_HOME_FILE = "server/adapter/tsukumo-home.ts"

describe("ネットワークの口", () => {
  it("`node:http` 系を値として import するのは view-server の server.ts だけ", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => relPath !== NETWORK_SERVER_FILE)
      .filter((relPath) =>
        importsModuleValue(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"), isNetworkModule),
      )

    expect(offenders).toEqual([])
    expect(
      importsModuleValue(
        readFileSync(`${SRC_ROOT}/${NETWORK_SERVER_FILE}`, "utf8"),
        isNetworkModule,
      ),
    ).toBe(true)
  })

  it("`fetch` を呼ぶのはブラウザの rpc-client.ts だけ", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => relPath !== FETCH_CALLER_FILE)
      .filter((relPath) => callsFetch(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")))

    expect(offenders).toEqual([])
    expect(callsFetch(readFileSync(`${SRC_ROOT}/${FETCH_CALLER_FILE}`, "utf8"))).toBe(true)
  })

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
})

// ホームディレクトリ（`homedir()`）は tsukumo-home.ts だけが読み、ほかはその関数を通して受け取る。
// `node:os` の値の import を禁じるので、別名や名前空間 import からの `homedir` も通らない。
describe("homedir を読む箇所", () => {
  it("`node:os` を値として import するのは src/server/adapter/tsukumo-home.ts だけ", () => {
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => relPath !== USER_HOME_FILE)
      .filter((relPath) =>
        importsModuleValue(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"), isOsModule),
      )

    expect(offenders).toEqual([])
    expect(
      importsModuleValue(readFileSync(`${SRC_ROOT}/${USER_HOME_FILE}`, "utf8"), isOsModule),
    ).toBe(true)
  })
})

describe("ネットワークと homedir を読む形の検出", () => {
  it("値の import は拾い、型だけの import・文字列・コメントは拾わない", () => {
    expect(importsModuleValue('import { createServer } from "node:http"', isNetworkModule)).toBe(
      true,
    )
    expect(importsModuleValue('import http from "http"', isNetworkModule)).toBe(true)
    expect(importsModuleValue('import "node:net"', isNetworkModule)).toBe(true)
    expect(importsModuleValue('export * from "node:tls"', isNetworkModule)).toBe(true)
    expect(importsModuleValue('const m = await import("node:dgram")', isNetworkModule)).toBe(true)
    expect(importsModuleValue('const m = require("node:https")', isNetworkModule)).toBe(true)
    expect(
      importsModuleValue('import { type Server, createServer } from "node:http"', isNetworkModule),
    ).toBe(true)
    expect(importsModuleValue('import { homedir } from "node:os"', isOsModule)).toBe(true)

    expect(importsModuleValue('import type { Server } from "node:http"', isNetworkModule)).toBe(
      false,
    )
    expect(importsModuleValue('import { type Server } from "node:http"', isNetworkModule)).toBe(
      false,
    )
    expect(importsModuleValue('const a = "node:http"', isNetworkModule)).toBe(false)
    expect(importsModuleValue('// import "node:http"', isNetworkModule)).toBe(false)
    expect(importsModuleValue('import { join } from "node:path"', isNetworkModule)).toBe(false)
  })

  it("`fetch` の呼び出しは拾い、`/fetch` の import と文字列は拾わない", () => {
    expect(callsFetch("fetch(url)")).toBe(true)
    expect(callsFetch("globalThis.fetch(url)")).toBe(true)
    expect(callsFetch('window["fetch"](url)')).toBe(true)

    expect(callsFetch('import { RPCHandler } from "@orpc/server/fetch"')).toBe(false)
    expect(callsFetch('const a = "fetch(url)"')).toBe(false)
    expect(callsFetch("// fetch(url)")).toBe(false)
    expect(callsFetch("request.fetch(url)")).toBe(false)
  })

  it("`listen` は第2引数が `BIND_HOST` でなければ拾う", () => {
    expect(listenWithoutBindHost("server.listen(port, BIND_HOST, cb)")).toBe(false)
    expect(listenWithoutBindHost('server.listen(port, "0.0.0.0", cb)')).toBe(true)
    expect(listenWithoutBindHost("server.listen(port, cb)")).toBe(true)
    expect(listenWithoutBindHost("server.listen(port)")).toBe(true)
    expect(listenWithoutBindHost("const a = 1")).toBe(false)
  })
})

function isNetworkModule(specifier: string): boolean {
  return NETWORK_MODULES.has(specifier.replace(/^node:/, ""))
}

function isOsModule(specifier: string): boolean {
  return specifier === "node:os" || specifier === "os"
}

/**
 * `matches` に合う module を値として読む形（`import`・`export … from`・動的 `import()`・`require()`）。
 * 型だけの import は拾わない。
 */
function importsModuleValue(content: string, matches: (specifier: string) => boolean): boolean {
  return astDescendants(parseSourceProgram(content)).some((node) => {
    const type = astString(node, "type")
    const source = astString(astObject(node, "source"), "value")
    if (type === "ImportDeclaration") {
      const specifiers = astChildren(node, "specifiers")
      const typeOnly =
        astString(node, "importKind") === "type" ||
        (specifiers.length > 0 &&
          specifiers.every((specifier) => astString(specifier, "importKind") === "type"))
      return source !== undefined && matches(source) && !typeOnly
    }
    if (type === "ExportNamedDeclaration" || type === "ExportAllDeclaration") {
      return source !== undefined && matches(source) && astString(node, "exportKind") !== "type"
    }
    if (type === "ImportExpression") {
      return source !== undefined && matches(source)
    }
    if (type === "CallExpression") {
      const callee = astObject(node, "callee")
      const [argument] = astChildren(node, "arguments")
      const value = astString(argument, "value")
      return (
        astString(callee, "type") === "Identifier" &&
        astString(callee, "name") === "require" &&
        value !== undefined &&
        matches(value)
      )
    }
    return false
  })
}

const GLOBAL_OBJECT_NAMES = new Set(["globalThis", "window", "self", "global"])

/** `fetch(…)` と、`globalThis.fetch(…)` のような大域のオブジェクト越しの呼び出し。 */
function callsFetch(content: string): boolean {
  return astDescendants(parseSourceProgram(content)).some((node) => {
    if (astString(node, "type") !== "CallExpression") {
      return false
    }
    const callee = astObject(node, "callee")
    if (astString(callee, "type") === "Identifier") {
      return astString(callee, "name") === "fetch"
    }
    if (astString(callee, "type") !== "MemberExpression") {
      return false
    }
    const object = astObject(callee, "object")
    const property = astObject(callee, "property")
    const computed = Reflect.get(callee ?? {}, "computed") === true
    return (
      astString(object, "type") === "Identifier" &&
      GLOBAL_OBJECT_NAMES.has(astString(object, "name") ?? "") &&
      (computed ? astString(property, "value") : astString(property, "name")) === "fetch"
    )
  })
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

describe("process の env / cwd を読む形の検出", () => {
  it("分割代入・別名・名前付き import・添字の読み取りを拾い、コメントと文字列は拾わない", () => {
    expect(readsProcessMember("const a = process.env.X", "env")).toBe(true)
    expect(readsProcessMember('const a = process["env"]', "env")).toBe(true)
    expect(readsProcessMember("const { env } = process", "env")).toBe(true)
    expect(readsProcessMember("const { env: e } = process", "env")).toBe(true)
    expect(readsProcessMember('import { env } from "node:process"', "env")).toBe(true)
    expect(readsProcessMember('import p from "node:process"\np.cwd()', "cwd")).toBe(true)
    expect(readsProcessMember("process?.env", "env")).toBe(true)

    expect(readsProcessMember("// process.env\nconst a = 1", "env")).toBe(false)
    expect(readsProcessMember('const a = "process.env"', "env")).toBe(false)
    expect(readsProcessMember("const a = process.cwd()", "env")).toBe(false)
    expect(readsProcessMember("const { cwd } = other", "cwd")).toBe(false)
  })

  it("構文エラーのある本文は throw する", () => {
    expect(() => readsProcessMember("const = (", "env")).toThrow("source.ts を読めない")
  })
})

/**
 * `process` の `member`（`env` / `cwd`）を読む形を構文木で探す。
 * `process.env`・`process["env"]`・`const { env } = process`・`import { env } from "node:process"`、
 * `import p from "node:process"` で束ねた別名の `p.env` を拾い、コメントと文字列の中の言及は拾わない。
 */
function readsProcessMember(content: string, member: string): boolean {
  const nodes = astDescendants(parseSourceProgram(content))
  const processNames = new Set(["process"])
  let found = false

  for (const node of nodes) {
    if (astString(node, "type") !== "ImportDeclaration") {
      continue
    }
    const source = astString(astObject(node, "source"), "value")
    if (source !== "node:process" && source !== "process") {
      continue
    }
    for (const specifier of astChildren(node, "specifiers")) {
      const local = astString(astObject(specifier, "local"), "name")
      if (astString(specifier, "type") === "ImportSpecifier") {
        found ||= keyName(astObject(specifier, "imported")) === member
      } else if (local !== undefined) {
        processNames.add(local)
      }
    }
  }

  const isProcess = (node: AstNode | undefined): boolean =>
    astString(node, "type") === "Identifier" && processNames.has(astString(node, "name") ?? "")

  for (const node of nodes) {
    const type = astString(node, "type")
    if (type === "MemberExpression" && isProcess(astObject(node, "object"))) {
      const property = astObject(node, "property")
      const computed = Reflect.get(node, "computed") === true
      found ||= computed ? astString(property, "value") === member : keyName(property) === member
    }
    if (
      type === "VariableDeclarator" &&
      isProcess(astObject(node, "init")) &&
      astString(astObject(node, "id"), "type") === "ObjectPattern"
    ) {
      found ||= astChildren(astObject(node, "id"), "properties").some(
        (property) => keyName(astObject(property, "key")) === member,
      )
    }
  }
  return found
}

function keyName(node: AstNode | undefined): string | undefined {
  return astString(node, "name") ?? astString(node, "value")
}
