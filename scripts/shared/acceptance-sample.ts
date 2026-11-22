// ワークフローの run の記録（journal.jsonl）から受け入れ役の判定を抜き、人が採点する表にする。純粋な部分だけを置く。

import { z } from "zod"

export type AcceptanceVerdict = "accept" | "reject"

export type AcceptanceDecision = {
  readonly verdict: AcceptanceVerdict
  readonly taskId: string
  readonly tree: string
  readonly findings: readonly string[]
  readonly findingKinds: readonly string[]
}

export type AcceptanceSampleSize = {
  readonly reject: number
  readonly accept: number
}

const startedLine = z.object({
  type: z.literal("started"),
  agentId: z.string(),
  label: z.string(),
})

const resultLine = z.object({
  type: z.literal("result"),
  agentId: z.string(),
  result: z.unknown(),
})

const acceptorResult = z.object({
  verdict: z.enum(["accept", "reject"]),
  tree: z.string().optional(),
  findings: z.array(z.string()).optional(),
  findingKinds: z.array(z.string()).optional(),
})

const prepareResult = z.object({ tree: z.string() })

const TASK_ID_PATTERN = /(?:GH|T)-\d+/

/** 1 run 分の journal.jsonl の本文から、受け入れ役（label が `acceptor-`）の判定を順に取り出す。読めない行は飛ばす。 */
export function parseAcceptanceDecisions(journal: string): readonly AcceptanceDecision[] {
  const entries = journal.split("\n").flatMap((line) => {
    try {
      return [JSON.parse(line) as unknown]
    } catch {
      return []
    }
  })
  const labels = new Map<string, string>()
  let taskId = "不明"
  const preparedTrees = new Map<string, string>()
  const decisions: AcceptanceDecision[] = []
  for (const entry of entries) {
    const started = startedLine.safeParse(entry)
    if (started.success) {
      labels.set(started.data.agentId, started.data.label)
      continue
    }
    const finished = resultLine.safeParse(entry)
    if (!finished.success) continue
    const label = labels.get(finished.data.agentId) ?? ""
    if (label === "implement" && taskId === "不明") {
      taskId = TASK_ID_PATTERN.exec(JSON.stringify(finished.data.result))?.[0] ?? taskId
      continue
    }
    const prepared = /^accept-prepare-(\d+)$/.exec(label)
    if (prepared?.[1] !== undefined) {
      const preparedTree = prepareResult.safeParse(finished.data.result)
      if (preparedTree.success) preparedTrees.set(prepared[1], preparedTree.data.tree)
      continue
    }
    if (!label.startsWith("acceptor-")) continue
    const parsed = acceptorResult.safeParse(finished.data.result)
    if (!parsed.success) continue
    decisions.push({
      verdict: parsed.data.verdict,
      taskId,
      tree: parsed.data.tree ?? preparedTrees.get(label.slice("acceptor-".length)) ?? "不明",
      findings: parsed.data.findings ?? [],
      findingKinds: parsed.data.findingKinds ?? [],
    })
  }
  return decisions
}

/** 判定ごとに、無作為に指定の件数を抜く。`random` は [0, 1) を返す乱数。足りないときは取れるだけ。 */
export function sampleDecisions(
  decisions: readonly AcceptanceDecision[],
  size: AcceptanceSampleSize,
  random: () => number,
): readonly AcceptanceDecision[] {
  return [
    ...pickRandom(
      decisions.filter((decision) => decision.verdict === "reject"),
      size.reject,
      random,
    ),
    ...pickRandom(
      decisions.filter((decision) => decision.verdict === "accept"),
      size.accept,
      random,
    ),
  ]
}

/** 種（整数）から決まる乱数。同じ種なら同じ抜き方になる。 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

/** 採点表（Markdown）。差し戻しは「正しい・誤り・どちらとも言えない」、通しは「不具合あり・なし」の欄を持つ。 */
export function formatScoringSheet(samples: readonly AcceptanceDecision[]): string {
  const rejects = samples.filter((sample) => sample.verdict === "reject")
  const accepts = samples.filter((sample) => sample.verdict === "accept")
  return [
    "# 受け入れ役の判定の採点表",
    "",
    `差し戻し ${String(rejects.length)} 件・通し ${String(accepts.length)} 件。`,
    "差し戻しは「判定」の欄に 正しい / 誤り / どちらとも言えない、通しは 不具合あり / なし を書く。",
    "",
    ...samples.flatMap((sample, index) => formatItem(sample, index + 1)),
  ].join("\n")
}

function formatItem(sample: AcceptanceDecision, number: number): readonly string[] {
  const heading = sample.verdict === "reject" ? "差し戻し" : "通し"
  const choices =
    sample.verdict === "reject" ? "正しい / 誤り / どちらとも言えない" : "不具合あり / なし"
  return [
    `## ${String(number)}. ${heading}`,
    "",
    `- タスク: ${sample.taskId}`,
    `- 送り出した木: ${sample.tree}`,
    `- 種類: ${sample.findingKinds.join("・") || "なし"}`,
    ...sample.findings.map((finding) => `- 指摘: ${finding}`),
    `- 判定（${choices}）: `,
    "- メモ: ",
    "",
  ]
}

function pickRandom<T>(items: readonly T[], count: number, random: () => number): readonly T[] {
  const pool = [...items]
  const picked: T[] = []
  while (picked.length < count && pool.length > 0) {
    const [chosen] = pool.splice(Math.floor(random() * pool.length), 1)
    if (chosen !== undefined) picked.push(chosen)
  }
  return picked
}
