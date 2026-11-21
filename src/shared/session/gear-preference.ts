// 歯車で選ぶ見た目と演出の5つ（地・領域・字の色、背景の暗さ・パネルのぼかし・濃さ、書き上げる演出の速さ、動きを減らす、起動するスキル）。
// 覚え先は `state.json` の最上位の5欄で、欄ごとに読み、読めない欄だけ同梱の既定へ畳む（ほかの欄は読んだ値のまま）。
// 欄の中も項ごとに畳む（色の1色・調整の1項が壊れていても、ほかの項は生かす）。

import { z } from "zod"

import { MAX_BACKGROUND_VEIL, MIN_BACKGROUND_VEIL } from "../character-pack/character-background.ts"

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i)
  .brand<"HexColor">()

/** `#rrggbb` の6桁であることを検査済みの色。 */
export type HexColor = z.infer<typeof hexColorSchema>

/** 3色の上書き。`undefined` は「上書きしない」で、そのときの色は `theme.css` の `:root` が持つ。 */
export type AppearanceColorOverride = {
  readonly ground?: HexColor
  readonly surface?: HexColor
  readonly ink?: HexColor
}

/**
 * 3色を差す `:root` のトークン。ブラウザが描き始めたあとに差すのと同じ名前を、サーバもページの `<html>` に焼く
 * （ブラウザのスクリプトが動く前の最初の描画から、整えた地の色で出すため）。
 */
export const APPEARANCE_COLOR_TOKEN_NAME = {
  ground: "--ground",
  surface: "--surface",
  ink: "--ink",
} as const satisfies Record<keyof AppearanceColorOverride, string>

export const DEFAULT_APPEARANCE_COLOR_OVERRIDE: AppearanceColorOverride = {
  ground: undefined,
  surface: undefined,
  ink: undefined,
}

export type AppearanceAdjust = {
  /** 背景の覆いの不透明度（0〜1）。`undefined` は動かしていない（パックの値に従う）。 */
  readonly veil?: number
  /** パネルのぼかし（px）。 */
  readonly blur: number
  /** パネルの濃さ（%）。 */
  readonly fill: number
}

export const BLUR_RANGE = { min: 0, max: 24 } as const
export const FILL_RANGE = { min: 20, max: 90 } as const

/** ぼかしと濃さの既定は `panel.css` の既定と同じ値。 */
export const DEFAULT_APPEARANCE_ADJUST: AppearanceAdjust = {
  veil: undefined,
  blur: 12,
  fill: 45,
}

export const REVEAL_SPEEDS = ["standard", "fast", "off"] as const

export type RevealSpeed = (typeof REVEAL_SPEEDS)[number]

const DEFAULT_REVEAL_SPEED: RevealSpeed = "standard"

/** `system` は OS の設定（`prefers-reduced-motion`）に従い、`reduce` は OS の設定が無くても減らす。 */
export const MOTION_PREFERENCES = ["system", "reduce"] as const

export type MotionPreference = (typeof MOTION_PREFERENCES)[number]

const DEFAULT_MOTION_PREFERENCE: MotionPreference = "system"

export type GearPreferences = {
  readonly appearanceColor: AppearanceColorOverride
  readonly appearanceAdjust: AppearanceAdjust
  readonly revealSpeed: RevealSpeed
  readonly motionPreference: MotionPreference
  /** 「タスクの実行」で呼ぶスキルの名前。空は「固定の文面で送る」。 */
  readonly launchSkill: string
}

export type GearPreferenceField = keyof GearPreferences

/** 同梱の既定。覚えた値が無い・読めない・知らない値の欄だけ、ここへ畳む。 */
export const BUILTIN_GEAR_PREFERENCES = {
  appearanceColor: DEFAULT_APPEARANCE_COLOR_OVERRIDE,
  appearanceAdjust: DEFAULT_APPEARANCE_ADJUST,
  revealSpeed: DEFAULT_REVEAL_SPEED,
  motionPreference: DEFAULT_MOTION_PREFERENCE,
  launchSkill: "",
} satisfies GearPreferences

/** 欄ごとの「覚えた読める値があったか」。偽の欄は既定へ畳んだ値。 */
export type GearPreferencesStored = Readonly<Record<GearPreferenceField, boolean>>

export type FoldedGearPreferences = {
  readonly values: GearPreferences
  readonly stored: GearPreferencesStored
}

/** 読めた欄だけを持つ。読めない欄は欠ける。 */
export type StoredGearPreferences = {
  readonly [Field in GearPreferenceField]?: GearPreferences[Field]
}

/**
 * ページの HTML に焼く `<script type="application/json">` の塊の id。中身は {@link FoldedGearPreferences} の JSON。
 * 描き始める前の値はここから同期で読む。
 */
export const GEAR_PREFERENCE_SEED_ELEMENT_ID = "tsukumo-gear-preferences"

/** 1欄の書き込み。範囲の外・知らない値は受け取らない。 */
export const gearPreferenceChangeSchema = z.discriminatedUnion("field", [
  z.object({
    field: z.literal("appearanceColor"),
    value: z.object({
      ground: hexColorSchema.optional(),
      surface: hexColorSchema.optional(),
      ink: hexColorSchema.optional(),
    }),
  }),
  z.object({
    field: z.literal("appearanceAdjust"),
    value: z.object({
      veil: z.number().min(MIN_BACKGROUND_VEIL).max(MAX_BACKGROUND_VEIL).optional(),
      blur: z.number().min(BLUR_RANGE.min).max(BLUR_RANGE.max),
      fill: z.number().min(FILL_RANGE.min).max(FILL_RANGE.max),
    }),
  }),
  z.object({ field: z.literal("revealSpeed"), value: z.enum(REVEAL_SPEEDS) }),
  z.object({ field: z.literal("motionPreference"), value: z.enum(MOTION_PREFERENCES) }),
  z.object({ field: z.literal("launchSkill"), value: z.string() }),
])

export type GearPreferenceChange = z.infer<typeof gearPreferenceChangeSchema>

const hexColorOrUndefined = hexColorSchema.optional().catch(undefined)

/**
 * 覚えた値を欄ごとに読む schema。欄の形（色と調整は object、ほかは値そのもの）が違えば読めない欄になる。
 * 形が合えば、項ごとに既定へ畳み、範囲の外の数は範囲へ収める。
 */
export const STORED_GEAR_PREFERENCE_SCHEMAS = {
  appearanceColor: z.object({
    ground: hexColorOrUndefined,
    surface: hexColorOrUndefined,
    ink: hexColorOrUndefined,
  }),
  appearanceAdjust: z.object({
    veil: clampedNumber(MIN_BACKGROUND_VEIL, MAX_BACKGROUND_VEIL).optional().catch(undefined),
    blur: clampedNumber(BLUR_RANGE.min, BLUR_RANGE.max).catch(DEFAULT_APPEARANCE_ADJUST.blur),
    fill: clampedNumber(FILL_RANGE.min, FILL_RANGE.max).catch(DEFAULT_APPEARANCE_ADJUST.fill),
  }),
  revealSpeed: z.enum(REVEAL_SPEEDS),
  motionPreference: z.enum(MOTION_PREFERENCES),
  launchSkill: z.string(),
} satisfies { readonly [Field in GearPreferenceField]: z.ZodType<GearPreferences[Field]> }

/** `raw`（`state.json` の中身など、5欄を最上位に持つ値）から、読めた欄だけを拾う。 */
export function pickStoredGearPreferences(raw: unknown): StoredGearPreferences {
  const record = z.record(z.string(), z.unknown()).safeParse(raw)
  if (!record.success) {
    return {}
  }
  // 読めない欄は `data` が欠ける。
  const pick = <Field extends GearPreferenceField>(
    field: Field,
    schema: z.ZodType<GearPreferences[Field]>,
  ) => schema.safeParse(record.data[field]).data
  return {
    appearanceColor: pick("appearanceColor", STORED_GEAR_PREFERENCE_SCHEMAS.appearanceColor),
    appearanceAdjust: pick("appearanceAdjust", STORED_GEAR_PREFERENCE_SCHEMAS.appearanceAdjust),
    revealSpeed: pick("revealSpeed", STORED_GEAR_PREFERENCE_SCHEMAS.revealSpeed),
    motionPreference: pick("motionPreference", STORED_GEAR_PREFERENCE_SCHEMAS.motionPreference),
    launchSkill: pick("launchSkill", STORED_GEAR_PREFERENCE_SCHEMAS.launchSkill),
  }
}

/** 5欄を最上位に持つ `raw` を欄ごとに読み、読めない欄だけ同梱の既定へ畳む。 */
export function foldGearPreferences(raw: unknown): FoldedGearPreferences {
  return completeGearPreferences(pickStoredGearPreferences(raw))
}

/** 読めた欄はその値、欠けた欄は同梱の既定で埋める。 */
function completeGearPreferences(stored: StoredGearPreferences): FoldedGearPreferences {
  return {
    values: {
      appearanceColor: stored.appearanceColor ?? BUILTIN_GEAR_PREFERENCES.appearanceColor,
      appearanceAdjust: stored.appearanceAdjust ?? BUILTIN_GEAR_PREFERENCES.appearanceAdjust,
      revealSpeed: stored.revealSpeed ?? BUILTIN_GEAR_PREFERENCES.revealSpeed,
      motionPreference: stored.motionPreference ?? BUILTIN_GEAR_PREFERENCES.motionPreference,
      launchSkill: stored.launchSkill ?? BUILTIN_GEAR_PREFERENCES.launchSkill,
    },
    stored: {
      appearanceColor: stored.appearanceColor !== undefined,
      appearanceAdjust: stored.appearanceAdjust !== undefined,
      revealSpeed: stored.revealSpeed !== undefined,
      motionPreference: stored.motionPreference !== undefined,
      launchSkill: stored.launchSkill !== undefined,
    },
  }
}

function clampedNumber(min: number, max: number) {
  return z
    .number()
    .finite()
    .transform((value) => Math.min(max, Math.max(min, value)))
}
