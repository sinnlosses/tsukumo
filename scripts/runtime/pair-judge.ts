// 版を比べる対（対を作る入口の出力）を、左右の画と架空の依頼文だけでモデルに判定させ、利用者の選択との一致率を出す入口。
// 判定には版の名前を渡さない。標準出力に出すのは対の ID・判定の側・数だけで、依頼文も応答の文面も出さない。
//
// 使い方:
//   node scripts/runtime/pair-judge.ts --out-dir /tmp/variant-pair/<日付>
//   node scripts/runtime/pair-judge.ts --out-dir <dir> --judge-model haiku --limit 1
//   node scripts/runtime/pair-judge.ts --out-dir <dir> --choices <dir>/choices.json

import { readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import process from "node:process"
import { parseArgs } from "node:util"

import { z } from "zod"

import { queryStructured } from "../../src/server/adapter/sdk-structured-query.ts"
import { REPORT_SCHEMA_VARIANTS } from "../../src/server/core/schema-variant.ts"
import type { StructuredQuery } from "../../src/server/core/structured-query.ts"
import { isModelAlias, MODEL_ALIASES } from "../../src/shared/command.ts"
import {
  agreementOf,
  choicesSchema,
  type JudgeAnswer,
  type PairChoices,
  type PairVerdict,
  verdictOf,
} from "./pair-verdict.ts"
import { VARIANT_REQUESTS } from "./variant-request.ts"

const USAGE = `使い方:
  node scripts/runtime/pair-judge.ts --out-dir <dir> [--judge-model <名前>] [--choices <file>] [--limit <n>]
    --out-dir      variant-pair.ts の出力先（pairs.json と shots/ を読み、verdicts.json を書く）
    --judge-model  判定のモデル（既定 sonnet。${MODEL_ALIASES.join("・")}）
    --choices      利用者が書いた選択の JSON（あれば一致率を出す）
    --limit        先頭から n 対だけ判定する（確かめ用）`

/** 1回の問い合わせの上限。 */
const JUDGE_TIMEOUT_MILLISECONDS = 300_000

const JUDGE_SYSTEM_PROMPT = `あなたは、同じ依頼に対して書かれた2本の作業レポートを見比べる審査役です。
1枚目と2枚目の画像は、それぞれ1本のレポートを画面に描いたものです。
依頼した人が読んだとき、結論と根拠がどちらのほうが速く分かるかだけで選んでください。
長さや装飾の多さではなく、読み終えるまでに迷う箇所の少なさで決めます。`

const answerSchema = z.object({ better: z.enum(["first", "second"]) })

const ANSWER_JSON_SCHEMA = {
  type: "object",
  properties: { better: { type: "string", enum: ["first", "second"] } },
  required: ["better"],
  additionalProperties: false,
} as const

const pairsFileSchema = z.record(
  z.string(),
  z.object({
    requestId: z.string(),
    left: z.enum(REPORT_SCHEMA_VARIANTS),
    right: z.enum(REPORT_SCHEMA_VARIANTS),
  }),
)

/** 一致率を出すかと、出すときの選択の JSON の場所。 */
type ChoicesSource = { readonly kind: "none" } | { readonly kind: "file"; readonly path: string }

type JudgeOptions = {
  readonly outDir: string
  readonly judgeModel: string
  readonly choices: ChoicesSource
  /** 判定する対の数の上限（`--limit` が無ければ全部）。 */
  readonly limit: number
}

const options = readOptions(process.argv.slice(2))
if (options === "invalid") {
  process.stderr.write(`${USAGE}\n`)
  process.exit(2)
}
const choices = readChoices(options.choices)
if (choices.kind === "unreadable") {
  process.stderr.write(
    `選択の JSON が読めない（{ "choices": { "<対の ID>": "left" | "right" | "undecided" } } の形で書く）\n`,
  )
  process.exit(2)
}
const verdicts = await judgePairs(options)
writeFileSync(join(options.outDir, "verdicts.json"), `${JSON.stringify(verdicts, undefined, 2)}\n`)
if (choices.kind === "read") {
  process.stdout.write(`${agreementLine(agreementOf(choices.value, verdicts))}\n`)
}

/** `pairs.json` の対ごとに、左右を入れ替えて2回聞いた判定。 */
async function judgePairs(judge: JudgeOptions): Promise<Readonly<Record<string, PairVerdict>>> {
  const pairs = pairsFileSchema.parse(
    JSON.parse(readFileSync(join(judge.outDir, "pairs.json"), "utf8")),
  )
  const verdictEntries: [string, PairVerdict][] = []
  for (const [pairId, pair] of Object.entries(pairs).slice(0, judge.limit)) {
    const request = VARIANT_REQUESTS.find((candidate) => candidate.id === pair.requestId)
    if (request === undefined) {
      process.stderr.write(`架空の依頼が見つからない: ${pairId}\n`)
      continue
    }
    const left = shotOf(judge.outDir, pairId, "left")
    const right = shotOf(judge.outDir, pairId, "right")
    const asked = await ask(judge, request.text, left, right)
    const swapped = await ask(judge, request.text, right, left)
    const verdict = verdictOf(asked, swapped)
    process.stdout.write(`${pairId} ${verdict}\n`)
    verdictEntries.push([pairId, verdict])
  }
  return Object.fromEntries(verdictEntries)
}

/** 先に見せる画と後に見せる画を添えて1回聞き、どちらを選んだかを返す。 */
async function ask(
  judge: JudgeOptions,
  requestText: string,
  first: string,
  second: string,
): Promise<JudgeAnswer> {
  const request: StructuredQuery = {
    kind: "pair-judge",
    model: judge.judgeModel,
    systemPrompt: JUDGE_SYSTEM_PROMPT,
    prompt: `依頼:\n${requestText}\n\n1枚目の画像のレポートが速く分かるなら first、2枚目なら second を答えてください。`,
    images: [
      { mediaType: "image/png", base64: first },
      { mediaType: "image/png", base64: second },
    ],
    schema: ANSWER_JSON_SCHEMA,
  }
  const answer = await queryStructured(
    request,
    {
      cwd: judge.outDir,
      env: process.env,
      record: () => {},
      now: () => Temporal.Now.instant().epochMilliseconds,
    },
    AbortSignal.timeout(JUDGE_TIMEOUT_MILLISECONDS),
  )
  return answerSchema.parse(answer).better
}

function shotOf(outDir: string, pairId: string, side: "left" | "right"): string {
  return readFileSync(join(outDir, "shots", `${pairId}-${side}.png`)).toString("base64")
}

function agreementLine(agreement: ReturnType<typeof agreementOf>): string {
  const rate = agreement.rate.kind === "none" ? "—" : `${(agreement.rate.value * 100).toFixed(1)}%`
  return `選んだ ${String(agreement.chosen)} 対のうち一致 ${String(agreement.agreed)} 対（${rate}）・判定が引き分け ${String(agreement.ties)} 対`
}

function readChoices(
  source: ChoicesSource,
):
  | { readonly kind: "none" }
  | { readonly kind: "read"; readonly value: PairChoices }
  | { readonly kind: "unreadable" } {
  if (source.kind === "none") {
    return source
  }
  try {
    const parsed = choicesSchema.safeParse(JSON.parse(readFileSync(source.path, "utf8")))
    return parsed.success ? { kind: "read", value: parsed.data } : { kind: "unreadable" }
  } catch {
    return { kind: "unreadable" }
  }
}

function readOptions(argv: readonly string[]): JudgeOptions | "invalid" {
  try {
    const { values } = parseArgs({
      args: [...argv],
      options: {
        "out-dir": { type: "string" },
        "judge-model": { type: "string" },
        choices: { type: "string" },
        limit: { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    })
    const judgeModel = values["judge-model"] ?? "sonnet"
    const limit = values.limit === undefined ? Number.POSITIVE_INFINITY : Number(values.limit)
    if (
      values["out-dir"] === undefined ||
      !isModelAlias(judgeModel) ||
      !(limit === Number.POSITIVE_INFINITY || (Number.isInteger(limit) && limit > 0))
    ) {
      return "invalid"
    }
    return {
      outDir: resolve(values["out-dir"]),
      judgeModel,
      choices:
        values.choices === undefined ? { kind: "none" } : { kind: "file", path: values.choices },
      limit,
    }
  } catch {
    return "invalid"
  }
}
