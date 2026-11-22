// 受け入れ役の判定を人が採点する表を、ワークフローの run の記録から作る入口。
// 表は指摘の文を含むので、作業ツリーでなく `$TSUKUMO_HOME` の下（acceptance-score/）に書く。
//
// 使い方:
//   node scripts/dev/acceptance-sample.ts [--reject 20] [--accept 10] [--seed <整数>]

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"
import { parseArgs } from "node:util"

import { defaultClaudeConfigDir, tsukumoHomeDir } from "../../src/server/adapter/tsukumo-home.ts"
import {
  formatScoringSheet,
  parseAcceptanceDecisions,
  sampleDecisions,
  seededRandom,
} from "../shared/acceptance-sample.ts"
import { positiveIntegerArgument } from "../shared/positive-integer-argument.ts"

const { values } = parseArgs({
  strict: true,
  options: {
    reject: { type: "string" },
    accept: { type: "string" },
    seed: { type: "string" },
  },
})
const reject = positiveIntegerArgument.default(20).safeParse(values.reject)
const accept = positiveIntegerArgument.default(10).safeParse(values.accept)
const seed = positiveIntegerArgument.default(1).safeParse(values.seed)
if (!reject.success || !accept.success || !seed.success) {
  process.stderr.write(
    "使い方: node scripts/dev/acceptance-sample.ts [--reject <n>] [--accept <n>] [--seed <n>]\n",
  )
  process.exit(2)
}

const decisions = journalPaths().flatMap((path) =>
  parseAcceptanceDecisions(readFileSync(path, "utf8")),
)
const samples = sampleDecisions(
  decisions,
  { reject: reject.data, accept: accept.data },
  seededRandom(seed.data),
)

const directory = join(tsukumoHomeDir(), "acceptance-score")
mkdirSync(directory, { recursive: true })
const sheetPath = join(directory, `sheet-seed-${String(seed.data)}.md`)
writeFileSync(sheetPath, formatScoringSheet(samples))

const rejected = samples.filter((sample) => sample.verdict === "reject").length
process.stdout.write(
  `SHEET\t${sheetPath}\t差し戻し ${String(rejected)}\t通し ${String(samples.length - rejected)}\t（母数 ${String(decisions.length)} 判定）\n`,
)

function journalPaths(): readonly string[] {
  const projects = join(defaultClaudeConfigDir(), "projects")
  return childDirectories(projects)
    .flatMap((project) =>
      childDirectories(project).flatMap((session) =>
        childDirectories(join(session, "subagents", "workflows")).map((run) =>
          join(run, "journal.jsonl"),
        ),
      ),
    )
    .filter((path) => existsSync(path))
}

function childDirectories(parent: string): readonly string[] {
  try {
    return readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(parent, entry.name))
  } catch {
    return []
  }
}
