import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { TSUKUMO_HOME_PLACES } from "../../src/server/adapter/tsukumo-home.ts"
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

/** `AGENTS.md` の承認の規則の正典。起こしてよい外部コマンドの一覧で、足すときはユーザーの承認を得る。 */
const ALLOWED_COMMANDS = [
  "orca",
  "open",
  "bd",
  "dolt",
  "gh",
  "python3",
  "taskpolicy",
  "rtk",
  "git",
  "pnpm",
  "node",
  "tw",
] as const

/**
 * 利用者の承認待ちの既存の依存。承認されたら `ALLOWED_COMMANDS` へ移す。
 * 新しい名前をここへ足してはならない。
 */
const UNAPPROVED_EXISTING_COMMANDS = ["lsof", "ps", "nice"] as const

/**
 * 第1引数が文字列リテラルにも同じファイルの最上位 `const` にも解けない呼び出しがあるファイルと、
 * その呼び出しが実際に起こすコマンド（包み関数の先まで追った実体）。
 */
const DYNAMIC_COMMAND_SITES = [
  {
    file: "src/server/session-driver/adapter/sdk-workflow-tw.ts",
    commands: ["tw"],
    reason: "取り込んだ `bin/tw` の絶対パス",
  },
  {
    file: "src/server/workflow-setting/adapter/tw-config.ts",
    commands: ["tw"],
    reason: "設定から受ける `tw` のパスか名前",
  },
  {
    file: "src/server/token-usage/adapter/tw-claim-list.ts",
    commands: ["tw"],
    reason: "設定から受ける `tw` のパスか名前",
  },
  {
    file: "src/server/checkout/adapter/checkout-launch.ts",
    commands: ["node"],
    reason:
      "別のチェックアウトの `bin/tsukumo`（sh の薄い包みで、最後に node の `src/cli.ts` を起こす）",
  },
  {
    file: "scripts/dev/check.ts",
    commands: ["pnpm", "taskpolicy", "nice"],
    reason: "段ごとの `pnpm run` を `stage-priority.ts` の前置きで包む",
  },
  {
    file: "scripts/shared/port-listener.ts",
    commands: ["lsof", "ps"],
    reason: "包み関数 `run` の中。呼ぶ側のリテラルは `run` の呼び出しとして別に照らす",
  },
] satisfies readonly { file: string; commands: readonly string[]; reason: string }[]

/** 第1引数にコマンド名を取る自前の包み関数。呼び出しの第1引数を `execFile` と同じに照らす。 */
const SPAWN_WRAPPERS = [{ file: "scripts/shared/port-listener.ts", name: "run" }] as const

const REPO_ROOT = `${SRC_ROOT}/..`
const SPAWN_FUNCTIONS = new Set([
  "execFile",
  "execFileSync",
  "spawn",
  "spawnSync",
  "exec",
  "execSync",
  "fork",
])

describe("起こす外部コマンドの一覧", () => {
  const files = [
    ...listSourceFiles(SRC_ROOT).map((relPath) => `src/${relPath}`),
    ...listSourceFiles(`${REPO_ROOT}/scripts`, `${REPO_ROOT}/scripts`, [".ts"]).map(
      (relPath) => `scripts/${relPath}`,
    ),
  ].map((file) => ({ file, use: spawnUse(file, readFileSync(`${REPO_ROOT}/${file}`, "utf8")) }))
  const knownCommands: readonly string[] = [...ALLOWED_COMMANDS, ...UNAPPROVED_EXISTING_COMMANDS]

  it("文字列で決まる第1引数は `ALLOWED_COMMANDS` か `UNAPPROVED_EXISTING_COMMANDS` にある", () => {
    const outside = files.flatMap(({ file, use }) =>
      use.commands
        .filter((command) => command !== undefined && !knownCommands.includes(command))
        .map((command) => `${file}: ${command}`),
    )

    expect(outside).toEqual([])
  })

  it("第1引数が静的に決まらない呼び出しがあるファイルは `DYNAMIC_COMMAND_SITES` と過不足なく一致する", () => {
    const found = files
      .filter(({ use }) => use.commands.includes(undefined))
      .map(({ file }) => file)

    expect(found.toSorted()).toEqual(DYNAMIC_COMMAND_SITES.map((site) => site.file).toSorted())
  })

  it("`DYNAMIC_COMMAND_SITES` の `commands` は `ALLOWED_COMMANDS` か `UNAPPROVED_EXISTING_COMMANDS` にある", () => {
    const outside = DYNAMIC_COMMAND_SITES.flatMap((site) =>
      site.commands.filter((command) => !knownCommands.includes(command)),
    )

    expect(outside).toEqual([])
  })

  it("`node:child_process` を名前空間・default で取り込むファイルは無い", () => {
    expect(files.filter(({ use }) => use.wholesale).map(({ file }) => file)).toEqual([])
  })

  it("リテラル・最上位 const は名前を返し、それ以外は `undefined` にする", () => {
    const head = 'import { execFile } from "node:child_process"\nconst C = "orca"\n'
    const commandsOf = (content: string) => spawnUse("src/a.ts", content).commands

    expect(commandsOf(`${head}execFile("git", [])`)).toEqual(["git"])
    expect(commandsOf(`${head}execFile(C, [])`)).toEqual(["orca"])
    expect(commandsOf(`${head}execFile(path, [])`)).toEqual([undefined])
    expect(commandsOf(`${head}function f() { const D = "git"; execFile(D, []) }`)).toEqual([
      undefined,
    ])
    expect(commandsOf('const a = 1\nexecFile("git")')).toEqual([])
  })

  it("別名・promisify・名前空間の import も拾う", () => {
    const from = 'from "node:child_process"\n'

    expect(spawnUse("src/a.ts", `import { spawn as run } ${from}run("git")`).commands).toEqual([
      "git",
    ])
    expect(
      spawnUse("src/a.ts", `import { execFile } ${from}const x = promisify(execFile)\nx("git")`)
        .commands,
    ).toEqual(["git"])
    expect(spawnUse("src/a.ts", `import * as cp ${from}cp.spawn("git")`).wholesale).toBe(true)
    expect(spawnUse("src/a.ts", `import cp ${from}cp.spawn("git")`).wholesale).toBe(true)
  })
})

type SpawnUse = {
  /** 起こす呼び出しの第1引数。静的に決まらなければ `undefined`。 */
  readonly commands: readonly (string | undefined)[]
  /** 名前空間か default で取り込み、どの関数を呼ぶか追えない。 */
  readonly wholesale: boolean
}

/**
 * `node:child_process` の起こす関数（別名と `promisify` を含む）と `SPAWN_WRAPPERS` の呼び出しを集める。
 * 第1引数は文字列リテラルか最上位 `const` の識別子だけ解く。
 */
function spawnUse(file: string, content: string): SpawnUse {
  const program = parseSourceProgram(content)
  const nodes = astDescendants(program)
  const spawners = new Set<string>(
    SPAWN_WRAPPERS.filter((wrapper) => wrapper.file === file).map((wrapper) => wrapper.name),
  )
  let wholesale = false
  for (const node of nodes.filter((n) => astString(n, "type") === "ImportDeclaration")) {
    const source = astString(astObject(node, "source"), "value") ?? ""
    for (const specifier of astChildren(node, "specifiers")) {
      const local = astString(astObject(specifier, "local"), "name") ?? ""
      if (["node:child_process", "child_process"].includes(source)) {
        if (astString(specifier, "type") !== "ImportSpecifier") {
          wholesale = true
        } else if (SPAWN_FUNCTIONS.has(astString(astObject(specifier, "imported"), "name") ?? "")) {
          spawners.add(local)
        }
      } else if (
        SPAWN_WRAPPERS.some(
          (wrapper) =>
            source.endsWith(wrapper.file.split("/").at(-1) ?? "") &&
            astString(astObject(specifier, "imported"), "name") === wrapper.name,
        )
      ) {
        spawners.add(local)
      }
    }
  }
  for (const node of nodes.filter((n) => astString(n, "type") === "VariableDeclarator")) {
    const init = astObject(node, "init")
    const [argument] = astChildren(init, "arguments")
    if (
      astString(astObject(init, "callee"), "name") === "promisify" &&
      spawners.has(astString(argument, "name") ?? "")
    ) {
      spawners.add(astString(astObject(node, "id"), "name") ?? "")
    }
  }

  const constants = new Map(
    astChildren(program, "body")
      .map((statement) => astObject(statement, "declaration") ?? statement)
      .filter(
        (statement) =>
          astString(statement, "type") === "VariableDeclaration" &&
          astString(statement, "kind") === "const",
      )
      .flatMap((statement) => astChildren(statement, "declarations"))
      .flatMap((declarator) => {
        const name = astString(astObject(declarator, "id"), "name")
        const init = astObject(declarator, "init")
        const value = astString(init, "type") === "Literal" ? astString(init, "value") : undefined
        return name !== undefined && value !== undefined ? [[name, value] as const] : []
      }),
  )
  const commands = nodes.flatMap((node) => {
    const callee = astObject(node, "callee")
    if (
      astString(node, "type") !== "CallExpression" ||
      astString(callee, "type") !== "Identifier" ||
      !spawners.has(astString(callee, "name") ?? "")
    ) {
      return []
    }
    const first = astChildren(node, "arguments")[0]
    if (astString(first, "type") === "Literal") {
      return [astString(first, "value")]
    }
    return [
      astString(first, "type") === "Identifier"
        ? constants.get(astString(first, "name") ?? "")
        : undefined,
    ]
  })

  return { commands, wholesale }
}

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

describe("~/.tsukumo の置き場", () => {
  it("`TSUKUMO_HOME_PLACES` の値が重複しない", () => {
    expect(duplicatedValues(Object.values(TSUKUMO_HOME_PLACES))).toEqual([])
  })

  it("同じ値を2つのキーに持たせた表は拾う", () => {
    expect(duplicatedValues(["items", "diary", "items"])).toEqual(["items"])
  })
})

function duplicatedValues(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))]
}

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
