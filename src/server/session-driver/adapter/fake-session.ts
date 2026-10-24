// 疑似セッションの形と、その読み込み。
// 疑似セッションは手で書いた架空の会話だけで、実物の transcript は使わない。

import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { z } from "zod"

import { type SessionDigest, sessionDigestSchema } from "../../../shared/session/session-digest.ts"
import { type SessionEvent, sessionEventSchema } from "../../../shared/session/session-event.ts"

/** 既定の疑似セッションの索引。tsukumo 自身の場所から解く（cwd に依存させない）。 */
const DEFAULT_SESSION_URL = new URL("../../../../fixture/fake-session/index.json", import.meta.url)

/** 場面のファイル名（拡張子を除く）。索引と同じディレクトリの外や索引そのものを指せない形にする。 */
const sceneNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/)
  .refine((name) => name !== "index")

/**
 * 疑似セッションの1手。`afterMs` はその場面の始まりからの経過（前の手からの差分ではない）。
 * `waitForAnswer` が true の手は、それまでに積んだ答え待ちがすべて答えられるまで流さず、`afterMs` を答えが届いた時点（先に届いていればその手に着いた時点）からの経過として数える。
 * 続く手の `afterMs` も、その手が流れた時点を0とする経過になる。
 */
const fakeSessionStepSchema = z.object({
  afterMs: z.number().min(0),
  event: sessionEventSchema,
  waitForAnswer: z.boolean().default(false),
})

/** 依頼1回ぶんの場面。名前で名指しできる（`FakeDriverOptions.scene`）。 */
const fakeSessionSceneSchema = z
  .object({
    name: z.string().min(1),
    resume: z.string().min(1).optional(),
    steps: z.array(fakeSessionStepSchema),
  })
  .superRefine((scene, ctx) => rejectDescendingSteps(scene.steps, `場面 ${scene.name}`, ctx))
  .transform((scene) => ({ ...scene, resume: scene.resume }))

/** 続きとして読み込める過去の transcript。`messages` は SDK が transcript に残す形の架空のメッセージ列。 */
const fakePastSessionSchema = z.object({
  sessionId: z.string().min(1),
  messages: z.array(z.unknown()),
})

/**
 * 疑似セッションの索引。`opening` は起こした直後に流す場面、`turns` は依頼を受けるたびに順に流す場面の名前
 * （場面の中身は索引と同じディレクトリの `<名前>.json`）。
 * 依頼が場面の数を超えたら先頭に戻って繰り返す（起こしっぱなしで何度でも試せるように）。
 */
const fakeSessionIndexSchema = z.object({
  opening: z
    .array(fakeSessionStepSchema)
    .superRefine((steps, ctx) => rejectDescendingSteps(steps, "opening", ctx)),
  turns: z.array(sceneNameSchema),
  pastSessions: z.array(fakePastSessionSchema).default([]),
  sessionDigests: z.record(z.string(), sessionDigestSchema).default({}),
  usageReview: z
    .object({
      review: z
        .array(fakeSessionStepSchema)
        .superRefine((steps, ctx) => rejectDescendingSteps(steps, "usageReview.review", ctx)),
      proposal: z
        .array(fakeSessionStepSchema)
        .superRefine((steps, ctx) => rejectDescendingSteps(steps, "usageReview.proposal", ctx)),
    })
    .default({ review: [], proposal: [] }),
})

/** 疑似セッションの1手（読み取り専用の形。zod の出力もこの形に収まる）。 */
export type FakeSessionStep = {
  readonly afterMs: number
  readonly event: SessionEvent
  readonly waitForAnswer: boolean
}

/**
 * 名前の付いた場面。
 * 名前は疑似セッションの中で重ならない前提で、同じ名前があれば先に書いたほうを使う。
 * 名前は画面の状態の呼び名（`question-multi` など）で、会話の内容ではない。
 */
export type FakeSessionScene = {
  readonly name: string
  /** この場面を名指しして起こしたとき、続きとして読み込む過去の transcript の `sessionId`。 */
  readonly resume: string | undefined
  readonly steps: readonly FakeSessionStep[]
}

export type FakePastSession = {
  readonly sessionId: string
  readonly messages: readonly unknown[]
}

export type FakeSession = {
  readonly opening: readonly FakeSessionStep[]
  readonly turns: readonly FakeSessionScene[]
  readonly pastSessions: readonly FakePastSession[]
  /**
   * 切り替え画面で選んだセッションの中身（`readSessionDigest` が返す）。
   * キーはセッションのID で、一覧に載せるのは場面が流す `sessions-changed`。無いIDは「読めない」になる。
   */
  readonly sessionDigests: Readonly<Record<string, SessionDigest>>
  /**
   * トークン消費の画面から頼んだ見直し（`review`）と提案の実行（`proposal`）で、問い合わせを起こさずに流す手順。
   * `afterMs` はその走りの始まりからの経過で、`waitForAnswer` は見ない。
   */
  readonly usageReview: {
    readonly review: readonly FakeSessionStep[]
    readonly proposal: readonly FakeSessionStep[]
  }
}

/** `readFakeSession` の結果。`reason` は読めなかった理由で、形が違うときは場面名と手の位置を含む。 */
export type FakeSessionReading =
  | { readonly kind: "read"; readonly session: FakeSession }
  | { readonly kind: "unreadable"; readonly reason: string }

/**
 * 疑似セッションを読む。`indexPath` は索引のファイルで、場面は同じディレクトリの `<場面名>.json` から読む。
 * 読めない・JSON でない・形が違う・場面のファイルの `name` がファイル名と違うときは `unreadable`。
 * 呼び出し側は起動を止めてよい（疑似セッションが無ければ fake driver には意味が無いので、起動時の前提不足として扱う）。
 */
export function readFakeSession(
  indexPath: string = fileURLToPath(DEFAULT_SESSION_URL),
): FakeSessionReading {
  const indexJson = readJsonFile(indexPath)
  if (indexJson.kind === "unreadable") {
    return indexJson
  }
  const index = fakeSessionIndexSchema.safeParse(indexJson.value)
  if (!index.success) {
    return {
      kind: "unreadable",
      reason: index.error.issues.map((issue) => issue.message).join(" / "),
    }
  }

  const turns: FakeSessionScene[] = []
  for (const name of index.data.turns) {
    const scenePath = path.join(path.dirname(indexPath), `${name}.json`)
    const sceneJson = readJsonFile(scenePath)
    if (sceneJson.kind === "unreadable") {
      return sceneJson
    }
    const scene = fakeSessionSceneSchema.safeParse(sceneJson.value)
    if (!scene.success) {
      return {
        kind: "unreadable",
        reason: scene.error.issues.map((issue) => issue.message).join(" / "),
      }
    }
    if (scene.data.name !== name) {
      return {
        kind: "unreadable",
        reason: `場面のファイルの name（${scene.data.name}）がファイル名と違う（${scenePath}）`,
      }
    }
    turns.push(scene.data)
  }
  return { kind: "read", session: { ...index.data, turns } }
}

/**
 * 最初のビューが繋がってから流す手を、流し始めからの `afterMs` で1本に並べる。
 * `opening` のあとに、名指しの場面（`scene`）を `opening` の一番遅い手の時刻から続ける。
 * 名前が疑似セッションに無ければ `opening` だけ。
 * `sceneUntil` があれば、場面の手は先頭からその個数で切る。
 */
export function startupSteps(
  session: FakeSession,
  scene: string | undefined,
  sceneUntil: number | undefined,
): readonly FakeSessionStep[] {
  const namedScene = session.turns.find((candidate) => candidate.name === scene)
  const openingSpanMs = session.opening.reduce((span, step) => Math.max(span, step.afterMs), 0)
  return [
    ...session.opening,
    ...(namedScene?.steps ?? []).slice(0, sceneUntil).map((step) => ({
      ...step,
      afterMs: openingSpanMs + step.afterMs,
    })),
  ]
}

/** 手の並びの順に `afterMs` が減る最初の手を、`where`（場面名か opening）と位置つきで拒む。同じ値は通す。`waitForAnswer` の手は時刻の数え直しなので、前の手とは比べない。 */
function rejectDescendingSteps(
  steps: readonly { readonly afterMs: number; readonly waitForAnswer: boolean }[],
  where: string,
  ctx: z.RefinementCtx,
): void {
  const index = steps.findIndex(
    (step, i) => i > 0 && !step.waitForAnswer && step.afterMs < (steps[i - 1]?.afterMs ?? 0),
  )
  if (index < 0) {
    return
  }
  ctx.addIssue({
    code: "custom",
    message: `${where} の手 ${String(index)}（0始まり）の afterMs ${String(steps[index]?.afterMs)} が前の手の ${String(steps[index - 1]?.afterMs)} より小さい（afterMs は場面の始まりからの経過で、手の並びの順に増える）`,
  })
}

type JsonFileReading =
  | { readonly kind: "read"; readonly value: unknown }
  | { readonly kind: "unreadable"; readonly reason: string }

function readJsonFile(filePath: string): JsonFileReading {
  let content: string
  try {
    content = readFileSync(filePath, "utf8")
  } catch {
    return { kind: "unreadable", reason: `ファイルを読めない（${filePath}）` }
  }
  try {
    return { kind: "read", value: JSON.parse(content) }
  } catch {
    return { kind: "unreadable", reason: `JSON として読めない（${filePath}）` }
  }
}
