// 地図のファイル（`.architecture-map.json`）の契約の型。欄・箱の ID・パスの書き方は `docs/architecture/architecture-map.md`。
// 作り手が書いた値を境界で検証する口で、通った値は箱の木と、木の中の箱を指すエッジとして整合している。
// 知らない欄は読み捨て、知らない種類のずれは種類の名前だけ残す。

import { z } from "zod"

/** tsukumo が読む契約の版。これより大きい版は読まない。 */
export const ARCHITECTURE_MAP_VERSION = 1

/** 地図のファイルの大きさの上限（バイト）。超えたら壊れている扱い。 */
export const MAX_ARCHITECTURE_MAP_BYTES = 5 * 1024 * 1024

/** 地図のファイルが読めない理由。壊れている（JSON でない・契約に沿わない・大きすぎる・開けない）と、知らない版。 */
export const MAP_UNREADABLE_REASONS = [
  "not-json",
  "off-contract",
  "too-large",
  "read-failed",
  "newer-version",
] as const
export type MapUnreadableReason = (typeof MAP_UNREADABLE_REASONS)[number]

/** 箱の ID の長さの上限（字数）。 */
const MAX_BOX_ID_LENGTH = 100

/** 箱の ID の区切り1つ。頭の `.` は1つまで、`.`・`..` だけの区切りは書けない。 */
const BOX_ID_SEGMENT = /^\.?[A-Za-z0-9_][A-Za-z0-9._-]*$/

/** パスの glob に使わない字（`?`・`[...]`・`{a,b}`・`!`）。 */
const FORBIDDEN_GLOB_CHARACTER = /[?[\]{}!]/

/** 箱の ID の形か。 */
export function isBoxId(value: string): boolean {
  return (
    value.length <= MAX_BOX_ID_LENGTH &&
    value.split("/").every((segment) => BOX_ID_SEGMENT.test(segment))
  )
}

/** 箱の `paths` の1要素の書き方か（頭に `./`・`/` を付けない、使わない字がない、空の区切りがない）。 */
function isBoxPathGlob(value: string): boolean {
  return (
    value !== "" &&
    !value.startsWith("./") &&
    !value.startsWith("/") &&
    !FORBIDDEN_GLOB_CHARACTER.test(value) &&
    value.split("/").every((segment) => segment !== "")
  )
}

/** 箱の `entrypoints` の1要素の書き方か（`paths` の1要素の書き方で、ワイルドカードを含まない）。 */
function isEntrypointPath(value: string): boolean {
  return isBoxPathGlob(value) && !value.includes("*")
}

/** 縮尺。`1` が大・`2` が中・`3` が小。 */
export const mapLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)])
export type MapLevel = z.infer<typeof mapLevelSchema>

const boxIdSchema = z.string().refine(isBoxId)
const boxPathsSchema = z.array(z.string().refine(isBoxPathGlob)).readonly()
const entrypointsSchema = z.array(z.string().refine(isEntrypointPath)).min(1).readonly()
const gridIndexSchema = z.number().int().min(0)

/** 親の図の中の格子の位置（0 始まり）。 */
export const mapPlaceSchema = z.object({ column: gridIndexSchema, row: gridIndexSchema })
export type MapPlace = z.infer<typeof mapPlaceSchema>

export const mapLinksSchema = z.object({
  adr: z.array(z.string()).readonly().optional(),
  terms: z.array(z.string()).readonly().optional(),
})
export type MapLinks = z.infer<typeof mapLinksSchema>

/** 区画の種類。`runtime` は動く場所、`crosscut` は横断の帯、`external` は外の世界。 */
export const mapLaneKindSchema = z.enum(["runtime", "crosscut", "external"])

const mapLaneSchema = z.object({
  id: z.string().refine((id) => BOX_ID_SEGMENT.test(id)),
  title: z.string().optional(),
  kind: mapLaneKindSchema,
})
type MapLane = z.infer<typeof mapLaneSchema>

const smallBoxSchema = z.object({
  id: boxIdSchema,
  title: z.string().optional(),
  summary: z.string().optional(),
  paths: boxPathsSchema,
  links: mapLinksSchema.optional(),
  entrypoints: entrypointsSchema.optional(),
  children: z.never().optional(),
})

const mediumBoxSchema = z.object({
  id: boxIdSchema,
  title: z.string().optional(),
  summary: z.string(),
  purpose: z.string().optional(),
  overview: z.string().optional(),
  paths: boxPathsSchema,
  links: mapLinksSchema.optional(),
  entrypoints: entrypointsSchema.optional(),
  aliases: z.array(boxIdSchema).readonly().optional(),
  place: mapPlaceSchema.optional(),
  children: z.array(smallBoxSchema).min(1).readonly(),
})

const largeBoxSchema = z
  .object({
    id: boxIdSchema,
    title: z.string().optional(),
    summary: z.string(),
    purpose: z.string().optional(),
    overview: z.string().optional(),
    paths: boxPathsSchema,
    links: mapLinksSchema.optional(),
    entrypoints: entrypointsSchema.optional(),
    aliases: z.array(boxIdSchema).readonly().optional(),
    external: z.boolean().optional(),
    lane: z.string().optional(),
    place: mapPlaceSchema.optional(),
    children: z.array(mediumBoxSchema).min(1).readonly().optional(),
  })
  .refine((box) =>
    box.external === true
      ? box.paths.length === 0 && box.children === undefined && box.entrypoints === undefined
      : box.children !== undefined,
  )

type LargeBox = z.infer<typeof largeBoxSchema>

const intendedEdgeSchema = z
  .object({
    from: boxIdSchema,
    to: boxIdSchema,
    label: z.string().optional(),
    origin: z.string().optional(),
  })
  .refine((edge) => edge.from !== edge.to)

export type IntendedEdge = z.output<typeof intendedEdgeSchema>

const actualEdgeSchema = z
  .object({
    from: boxIdSchema,
    to: boxIdSchema,
    count: z.number().int().min(1),
  })
  .refine((edge) => edge.from !== edge.to)

export const severitySchema = z.enum(["error", "warn"])

export const knownFindingSchemas = [
  z.object({
    kind: z.literal("undeclared-edge"),
    severity: severitySchema,
    from: z.string(),
    to: z.string(),
    count: z.number().int().min(1),
    sample: z.object({ from: z.string(), to: z.string() }),
  }),
  z.object({ kind: z.literal("unmapped-file"), severity: severitySchema, path: z.string() }),
  z.object({
    kind: z.literal("overlapping-file"),
    severity: severitySchema,
    path: z.string(),
    boxes: z.array(z.string()).readonly(),
  }),
  z.object({
    kind: z.literal("split-directory"),
    severity: severitySchema,
    path: z.string(),
    boxes: z.array(z.string()).readonly(),
  }),
  z.object({ kind: z.literal("empty-box"), severity: severitySchema, box: z.string() }),
  z.object({
    kind: z.literal("missing-link"),
    severity: severitySchema,
    box: z.string(),
    path: z.string(),
  }),
  z.object({
    kind: z.literal("unused-intended-edge"),
    severity: severitySchema,
    from: z.string(),
    to: z.string(),
  }),
] as const

const KNOWN_FINDING_KINDS: ReadonlySet<string> = new Set(
  knownFindingSchemas.map((schema) => schema.shape.kind.value),
)

const fileFindingSchema = z.union([
  z.discriminatedUnion("kind", knownFindingSchemas),
  z
    .object({
      kind: z.string().refine((kind) => !KNOWN_FINDING_KINDS.has(kind)),
      severity: severitySchema,
    })
    .transform(({ kind, severity }) => ({ kind: "unknown" as const, name: kind, severity })),
])

export const mapSourceSchema = z.object({
  producer: z.string(),
  commit: z.string(),
  tree: z.string().optional(),
})

/** 地図のファイルを読んだ型。箱の ID と別名は重ならず、エッジの端は今の ID の箱を指す。 */
export const architectureMapSchema = z
  .object({
    version: z.literal(ARCHITECTURE_MAP_VERSION),
    source: mapSourceSchema,
    overview: z.string().optional(),
    lanes: z.array(mapLaneSchema).min(1).readonly().optional(),
    boxes: z.array(largeBoxSchema).min(1).readonly(),
    edges: z.object({
      intended: z.array(intendedEdgeSchema).readonly(),
      actual: z.array(actualEdgeSchema).readonly(),
    }),
    findings: z.array(fileFindingSchema).readonly(),
  })
  .superRefine((map, context) => {
    const levels = boxLevelsOf(map.boxes)
    const reject = (message: string) => context.addIssue({ code: "custom", message })
    if (levels.duplicated) {
      reject("箱の ID と別名が重なっている")
    }
    if (!lanesAreConsistent(map.boxes, map.lanes)) {
      reject("区画の欄が決まりに沿っていない")
    }
    for (const edge of map.edges.intended) {
      if (!levels.byId.has(edge.from) || !levels.byId.has(edge.to)) {
        reject("意図したエッジの端が今の ID の箱を指していない")
      }
    }
    for (const edge of map.edges.actual) {
      if (levels.byId.get(edge.from) !== 3 || levels.byId.get(edge.to) !== 3) {
        reject("実際のエッジの端が小の箱を指していない")
      }
    }
  })

export type ArchitectureMap = z.output<typeof architectureMapSchema>

/** `lanes` が無ければどの大の箱も `lane` を持たず、あれば全部が持つ。指す区画・外の箱と `external` の区画・空の区画・`id` の重なりも確かめる。 */
function lanesAreConsistent(boxes: readonly LargeBox[], lanes?: readonly MapLane[]): boolean {
  if (lanes === undefined) {
    return boxes.every((box) => box.lane === undefined)
  }
  const byId = new Map(lanes.map((lane) => [lane.id, lane]))
  if (byId.size !== lanes.length) {
    return false
  }
  const used = new Set<string>()
  for (const box of boxes) {
    const lane = box.lane === undefined ? undefined : byId.get(box.lane)
    if (lane === undefined || (box.external === true) !== (lane.kind === "external")) {
      return false
    }
    used.add(lane.id)
  }
  return used.size === lanes.length
}

type BoxLevels = {
  /** 今の ID から縮尺。別名は含まない。 */
  readonly byId: ReadonlyMap<string, MapLevel>
  /** ID と別名のどれかが2回以上現れたか。 */
  readonly duplicated: boolean
}

function boxLevelsOf(boxes: readonly LargeBox[]): BoxLevels {
  const byId = new Map<string, MapLevel>()
  const names = new Set<string>()
  let duplicated = false
  const note = (id: string, aliases: readonly string[], level: MapLevel) => {
    for (const name of [id, ...aliases]) {
      duplicated = duplicated || names.has(name)
      names.add(name)
    }
    byId.set(id, level)
  }
  for (const large of boxes) {
    note(large.id, large.aliases ?? [], 1)
    for (const medium of large.children ?? []) {
      note(medium.id, medium.aliases ?? [], 2)
      for (const small of medium.children) {
        note(small.id, [], 3)
      }
    }
  }
  return { byId, duplicated }
}
