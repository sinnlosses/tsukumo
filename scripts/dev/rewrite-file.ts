// 複数ファイルへ同じ語の置換をかける、テンプレートから複数ファイルを作る、という Bash の `sed -i`・heredoc・python で
// 書きたくなる作業の入口（それらは hook が拒む）。1ファイルの置換は Edit、全体の作り直しは Write を使う。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import process from "node:process"
import { parseArgs } from "node:util"

import { z } from "zod"

import { REPOSITORY_ROOT as ROOT } from "../shared/repository-root.ts"
import { expandTemplate, replaceAll } from "./lib/rewrite-text.ts"

const HELP = `複数ファイルの一括置換と、テンプレートからの複数ファイルの生成。

  replace --from <文字列> --to <文字列> <ファイル...>
      各ファイルの <文字列> を文字どおりに（正規表現でなく）すべて置き換える。
      一致が 0 件のファイルがあれば、何も書かずに止める。
  expand --template <ファイル> --values <JSONファイル> --out <パス> [--overwrite]
      値のJSON（{"名前": "値"} の配列）の1件ごとに、テンプレートの {{名前}} を置き換えて
      --out（{{名前}} を含めてよい）のパスへ書く。--overwrite が無いと既存のファイルは書かずに止める。

パスはこのリポジトリの中だけ。`

const ENTRIES = z.array(z.record(z.string(), z.string()))

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    from: { type: "string" },
    to: { type: "string" },
    template: { type: "string" },
    values: { type: "string" },
    out: { type: "string" },
    overwrite: { type: "boolean" },
    help: { type: "boolean" },
  },
})

const [command, ...paths] = positionals
if (values.help || command === undefined) {
  process.stdout.write(`${HELP}\n`)
} else if (command === "replace" && values.from !== undefined && values.to !== undefined) {
  replaceInFiles(values.from, values.to, paths)
} else if (
  command === "expand" &&
  values.template !== undefined &&
  values.values !== undefined &&
  values.out !== undefined
) {
  expandFiles(values.template, values.values, values.out, values.overwrite === true)
} else {
  fail(`引数が足りない。\n${HELP}`)
}

function replaceInFiles(from: string, to: string, targets: readonly string[]): void {
  if (from === "" || targets.length === 0) {
    fail("--from は空にできず、ファイルを1つ以上渡す")
  }
  const results = targets.map((target) => {
    const path = insideRepository(target)
    return { path, ...replaceAll(readFileSync(path, "utf8"), from, to) }
  })
  const unmatched = results.filter((result) => result.count === 0)
  if (unmatched.length > 0) {
    fail(`一致が無い（何も書いていない）: ${unmatched.map((result) => result.path).join(", ")}`)
  }
  for (const result of results) {
    writeFileSync(result.path, result.text)
    process.stdout.write(`${relative(ROOT, result.path)}: ${result.count} 件\n`)
  }
}

function expandFiles(template: string, valuesFile: string, out: string, overwrite: boolean): void {
  const templateText = readFileSync(insideRepository(template), "utf8")
  const entries = parseEntries(readFileSync(insideRepository(valuesFile), "utf8"))
  const outputs = entries.map((entry) => ({
    path: insideRepository(expandTemplate(out, entry)),
    text: expandTemplate(templateText, entry),
  }))
  const existing = outputs.filter((output) => existsSync(output.path))
  if (!overwrite && existing.length > 0) {
    fail(
      `既にある（何も書いていない。上書きするなら --overwrite）: ${existing.map((o) => o.path).join(", ")}`,
    )
  }
  for (const output of outputs) {
    mkdirSync(dirname(output.path), { recursive: true })
    writeFileSync(output.path, output.text)
    process.stdout.write(`${relative(ROOT, output.path)}\n`)
  }
}

function parseEntries(json: string): readonly Record<string, string>[] {
  const parsed = ENTRIES.safeParse(JSON.parse(json))
  return parsed.success ? parsed.data : fail("--values は {名前: 文字列} の配列のJSONにする")
}

function insideRepository(path: string): string {
  const absolute = resolve(path)
  if (relative(ROOT, absolute).startsWith("..")) {
    return fail(`リポジトリの外のパスは扱わない: ${path}`)
  }
  return absolute
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`)
  return process.exit(1)
}
