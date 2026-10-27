import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { arrayField, descendants, objectField, stringField } from "../../scripts/shared/ast-node.ts"
import { REPOSITORY_ROOT } from "../../scripts/shared/repository-root.ts"
import { TSUKUMO_HOME_PLACES } from "../../src/server/adapter/tsukumo-home.ts"
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
  it("`orca` コマンドを呼ぶのは orca-host.ts だけ、`open` コマンドを呼ぶのは browser-host.ts だけ", () => {
    const spawning = listSourceFiles(SRC_ROOT).filter((relPath) =>
      importSpecifiers(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")).some(
        (specifier) => specifier === "node:child_process" || specifier === "child_process",
      ),
    )

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
  "rtk",
  "git",
  "pnpm",
  "node",
  "tw",
  "claude",
] as const

/**
 * 利用者の承認待ちの既存の依存。承認されたら `ALLOWED_COMMANDS` へ移す。
 * 新しい名前をここへ足してはならない。
 */
const UNAPPROVED_EXISTING_COMMANDS = ["lsof", "ps"] as const

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
    file: "scripts/shared/port-listener.ts",
    commands: ["lsof", "ps"],
    reason: "包み関数 `run` の中。呼ぶ側のリテラルは `run` の呼び出しとして別に照らす",
  },
] satisfies readonly { file: string; commands: readonly string[]; reason: string }[]

/** 第1引数にコマンド名を取る自前の包み関数。呼び出しの第1引数を `execFile` と同じに照らす。 */
const SPAWN_WRAPPERS = [{ file: "scripts/shared/port-listener.ts", name: "run" }] as const

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
    ...listSourceFiles(`${REPOSITORY_ROOT}/scripts`, `${REPOSITORY_ROOT}/scripts`, [".ts"]).map(
      (relPath) => `scripts/${relPath}`,
    ),
  ].map((file) => ({
    file,
    use: spawnUse(file, readFileSync(`${REPOSITORY_ROOT}/${file}`, "utf8")),
  }))
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
  const nodes = descendants(program)
  const spawners = new Set<string>(
    SPAWN_WRAPPERS.filter((wrapper) => wrapper.file === file).map((wrapper) => wrapper.name),
  )
  let wholesale = false
  for (const node of nodes.filter((n) => stringField(n, "type") === "ImportDeclaration")) {
    const source = stringField(objectField(node, "source"), "value") ?? ""
    for (const specifier of arrayField(node, "specifiers")) {
      const local = stringField(objectField(specifier, "local"), "name") ?? ""
      if (["node:child_process", "child_process"].includes(source)) {
        if (stringField(specifier, "type") !== "ImportSpecifier") {
          wholesale = true
        } else if (
          SPAWN_FUNCTIONS.has(stringField(objectField(specifier, "imported"), "name") ?? "")
        ) {
          spawners.add(local)
        }
      } else if (
        SPAWN_WRAPPERS.some(
          (wrapper) =>
            source.endsWith(wrapper.file.split("/").at(-1) ?? "") &&
            stringField(objectField(specifier, "imported"), "name") === wrapper.name,
        )
      ) {
        spawners.add(local)
      }
    }
  }
  for (const node of nodes.filter((n) => stringField(n, "type") === "VariableDeclarator")) {
    const init = objectField(node, "init")
    const [argument] = arrayField(init, "arguments")
    if (
      stringField(objectField(init, "callee"), "name") === "promisify" &&
      spawners.has(stringField(argument, "name") ?? "")
    ) {
      spawners.add(stringField(objectField(node, "id"), "name") ?? "")
    }
  }

  const constants = new Map(
    arrayField(program, "body")
      .map((statement) => objectField(statement, "declaration") ?? statement)
      .filter(
        (statement) =>
          stringField(statement, "type") === "VariableDeclaration" &&
          stringField(statement, "kind") === "const",
      )
      .flatMap((statement) => arrayField(statement, "declarations"))
      .flatMap((declarator) => {
        const name = stringField(objectField(declarator, "id"), "name")
        const init = objectField(declarator, "init")
        const value =
          stringField(init, "type") === "Literal" ? stringField(init, "value") : undefined
        return name !== undefined && value !== undefined ? [[name, value] as const] : []
      }),
  )
  const commands = nodes.flatMap((node) => {
    const callee = objectField(node, "callee")
    if (
      stringField(node, "type") !== "CallExpression" ||
      stringField(callee, "type") !== "Identifier" ||
      !spawners.has(stringField(callee, "name") ?? "")
    ) {
      return []
    }
    const first = arrayField(node, "arguments")[0]
    if (stringField(first, "type") === "Literal") {
      return [stringField(first, "value")]
    }
    return [
      stringField(first, "type") === "Identifier"
        ? constants.get(stringField(first, "name") ?? "")
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
  return descendants(parseSourceProgram(content)).some(
    (node) =>
      stringField(node, "type") === "ImportDeclaration" &&
      ["node:process", "process"].includes(
        stringField(objectField(node, "source"), "value") ?? "",
      ) &&
      arrayField(node, "specifiers").some(
        (specifier) =>
          stringField(specifier, "type") !== "ImportSpecifier" &&
          stringField(objectField(specifier, "local"), "name") !== "process",
      ),
  )
}

// テキストのファイルは `writeFileAtomic` が書き、途中の状態を見せない。
// `writeFileSync` を取り込めるのは、それを包む atomic-file.ts と、置き換えでは足りない書き方のファイルだけ。
const WRITE_FILE_SYNC_ALLOWED = [
  "server/adapter/lib/atomic-file.ts",
  // 画像（バイナリ）の書き出し
  "server/item/adapter/item-store.ts",
  "server/character-pack/adapter/character-edit.ts",
  // `wx` で排他的に作る錠
  "server/adapter/query-lock.ts",
]

describe("ファイルの書き出し", () => {
  it("`writeFileSync` を取り込むのは atomic-file.ts と許可リストのファイルだけ", () => {
    const importing = listSourceFiles(SRC_ROOT).filter((relPath) =>
      importsWriteFileSync(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")),
    )

    expect(importing.filter((relPath) => !WRITE_FILE_SYNC_ALLOWED.includes(relPath))).toEqual([])
  })

  it("許可リストのファイルは、いまも `writeFileSync` を取り込んでいる", () => {
    const stale = WRITE_FILE_SYNC_ALLOWED.filter(
      (relPath) => !importsWriteFileSync(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")),
    )

    expect(stale).toEqual([])
  })

  it("名前付き・別名・名前空間・default の import は拾い、ほかの関数の import は拾わない", () => {
    expect(importsWriteFileSync('import { writeFileSync } from "node:fs"')).toBe(true)
    expect(importsWriteFileSync('import { writeFileSync as put } from "fs"')).toBe(true)
    expect(importsWriteFileSync('import * as fs from "node:fs"')).toBe(true)
    expect(importsWriteFileSync('import fs from "node:fs"')).toBe(true)

    expect(importsWriteFileSync('import { readFileSync } from "node:fs"')).toBe(false)
    expect(importsWriteFileSync('import { writeFile } from "node:fs/promises"')).toBe(false)
    expect(importsWriteFileSync('import { writeFileSync } from "./other.ts"')).toBe(false)
  })
})

/** `node:fs` から `writeFileSync` を取り込むか。名前空間・default は呼び先を追えないので取り込むとみなす。 */
function importsWriteFileSync(content: string): boolean {
  return descendants(parseSourceProgram(content)).some(
    (node) =>
      stringField(node, "type") === "ImportDeclaration" &&
      ["node:fs", "fs"].includes(stringField(objectField(node, "source"), "value") ?? "") &&
      arrayField(node, "specifiers").some(
        (specifier) =>
          stringField(specifier, "type") !== "ImportSpecifier" ||
          stringField(objectField(specifier, "imported"), "name") === "writeFileSync",
      ),
  )
}

/** 第2引数が識別子 `BIND_HOST` でない `.listen(…)` の呼び出しがあるか。 */
function listenWithoutBindHost(content: string): boolean {
  return descendants(parseSourceProgram(content)).some((node) => {
    if (stringField(node, "type") !== "CallExpression") {
      return false
    }
    const callee = objectField(node, "callee")
    if (
      stringField(callee, "type") !== "MemberExpression" ||
      stringField(objectField(callee, "property"), "name") !== "listen"
    ) {
      return false
    }
    const host = arrayField(node, "arguments")[1]
    return !(
      stringField(host, "type") === "Identifier" && stringField(host, "name") === "BIND_HOST"
    )
  })
}
