// いまの様子を依頼に添えて渡したこと（`present-scene`）の足跡の形。
// 時刻と、渡した材料の種類の語だけを持つ。添えた文面も材料の値も持たない。

import { z } from "zod"

/** いまの様子の材料の種類。並びは添える文面の行の順。 */
const PRESENT_SCENE_KINDS = [
  "time-band",
  "worked-time",
  "done-today",
  "away",
  "plan-usage",
  "next-task",
] as const

/** いまの様子の材料の種類の語。 */
export type PresentSceneKind = (typeof PRESENT_SCENE_KINDS)[number]

export const presentSceneFootprintSchema = z.object({
  flow: z.literal("present-scene"),
  /** 渡した時刻（エポックミリ秒）。 */
  at: z.number(),
  /** 渡した材料の種類。 */
  kinds: z.array(z.enum(PRESENT_SCENE_KINDS)).readonly(),
})

/** いまの様子を1回渡したこと。 */
export type PresentSceneFootprint = Readonly<z.infer<typeof presentSceneFootprintSchema>>
