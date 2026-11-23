// 画面が引く地図の1枚の図（縮尺1つ、またはフォーカスした箱1つ）の形。
// 箱とエッジは図の段に束ね済みで、画面は束ね方を知らない。配置（`place` が全部そろわないときの列と行）は画面が決める。

import { z } from "zod"

import {
  knownFindingSchemas,
  MAP_UNREADABLE_REASONS,
  mapLevelSchema,
  mapLinksSchema,
  mapPlaceSchema,
  mapSourceSchema,
  severitySchema,
} from "./architecture-map.ts"

/** 画面へ渡すずれ。知らない種類は名前（`name`）だけを持つ。 */
const mapFindingSchema = z.discriminatedUnion("kind", [
  ...knownFindingSchemas,
  z.object({ kind: z.literal("unknown"), name: z.string(), severity: severitySchema }),
])

/** 箱を赤で描くずれの種類。 */
const mapBoxProblemSchema = z.enum(["empty-box", "missing-link", "undeclared-edge"])

const mapViewBoxSchema = z.object({
  id: z.string(),
  /** 表示名。地図のファイルに無ければ `id`。 */
  title: z.string(),
  summary: z.string().optional(),
  purpose: z.string().optional(),
  overview: z.string().optional(),
  level: mapLevelSchema,
  /** リポジトリの外の相手の箱。 */
  external: z.boolean(),
  /** 子を持つ（押すとフォーカスした図へ潜れる）。 */
  hasChildren: z.boolean(),
  place: mapPlaceSchema.optional(),
  links: mapLinksSchema.optional(),
  problems: z.array(mapBoxProblemSchema).readonly(),
})

const mapViewSchema = z.object({
  /** 図に描く箱の縮尺。 */
  level: mapLevelSchema,
  /** フォーカスした箱。無ければ、その縮尺の全体の図。 */
  focus: z.object({ id: z.string(), title: z.string(), level: mapLevelSchema }).optional(),
  boxes: z.array(mapViewBoxSchema).readonly(),
  /** 実際のエッジを図の段に束ねたもの。`count` は import の本数の合計。 */
  edges: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        count: z.number().int().min(1),
        undeclared: z.boolean(),
      }),
    )
    .readonly(),
  /** 意図したエッジを図の段に置き換えたもの。 */
  intendedEdges: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        label: z.string().optional(),
        origin: z.string().optional(),
      }),
    )
    .readonly(),
  /** 図の中の同じ箱に閉じた import の本数の合計。 */
  closedCount: z.number().int().min(0),
  findings: z.array(mapFindingSchema).readonly(),
})

/** 地図を引く選び方。縮尺で全体を引くか、箱を指してその子の図を引く（箱は ID か別名）。 */
export const mapSelectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("level"), level: mapLevelSchema }),
  z.object({ kind: z.literal("focus"), box: z.string() }),
])

/** 図が引けたとき。`overview` は縮尺が大の全体の図だけに付く。 */
const mapReadySchema = z.object({
  kind: z.literal("ready"),
  source: mapSourceSchema,
  overview: z.string().optional(),
  view: mapViewSchema,
})

/**
 * 地図を引いた結果。
 * 地図のファイルが無いときは `absent`、読めないときは理由つきの `unreadable`（壊れている・知らない版・大きすぎる）、
 * 指した箱が無い・子を持たないときは `unfocusable`。
 */
export const mapViewResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("absent") }),
  z.object({ kind: z.literal("unreadable"), reason: z.enum(MAP_UNREADABLE_REASONS) }),
  z.object({ kind: z.literal("unfocusable"), reason: z.enum(["unknown-box", "no-children"]) }),
  mapReadySchema,
])

export type MapViewResponse = z.infer<typeof mapViewResponseSchema>
export type MapView = z.infer<typeof mapViewSchema>
export type MapViewBox = z.infer<typeof mapViewBoxSchema>
export type MapSelection = z.infer<typeof mapSelectionSchema>
export type MapReady = z.infer<typeof mapReadySchema>
