import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { astChildren, astDescendants, astObject, astString, type AstNode } from "./ast-node.ts"
import { importSpecifiers, listSourceFiles, parseSourceProgram, SRC_ROOT } from "./source-file.ts"

// ここから、層の辺だけでは表せない限定の検査（`adapter` の中のどのファイルか、まで絞る）。

// SDK（`@anthropic-ai/claude-agent-sdk`）を import するのは機能の `adapter/` 直下
// （`server/<機能>/adapter/`）の `sdk-` で始まるファイルに閉じ込める（docs/architecture.md「1ファイル = 1つの境界」）。
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
// `bin/tsukumo` へ委ねる口・取り込んだワークフローの `bin/tw ask-guard` を起こす口・
// ワークフローの設定コマンド（`tw config`）を起こす口・Bash の出力を縮める `rtk rewrite` を起こす口の8つの境界に閉じ込める（docs/architecture.md「1ファイル = 1つの境界」）。
// そのうち `orca` コマンドを起こすのは orca-host.ts だけ。
// `execFile("orca", …)` のような呼び出しは必ずコマンド名の文字列リテラル "orca" を伴うので、その字面で探す。
// ファイル名やバッククォートで囲んだ日本語の説明文はクォートされた文字列リテラルではないので拾わない。
describe("子プロセスを起こす箇所", () => {
  it("`node:child_process` を import するのは orca-host.ts・bundle.ts・git.ts・beads.ts・checkout-launch.ts・rtk-rewrite.ts・sdk-ask-guard.ts・tw-config.ts だけで、`orca` コマンドを呼ぶのは orca-host.ts だけ", () => {
    const allowed = new Set([
      "server/checkout/adapter/checkout-launch.ts",
      "server/host/adapter/orca-host.ts",
      "server/view-server/adapter/bundle.ts",
      "server/repository/adapter/git.ts",
      "server/repository/adapter/beads.ts",
      "server/session-driver/adapter/rtk-rewrite.ts",
      "server/session-driver/adapter/sdk-ask-guard.ts",
      "server/workflow-setting/adapter/tw-config.ts",
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
    expect(() => readsProcessMember("const = (", "env")).toThrow()
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
