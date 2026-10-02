// セッションのコマンドの契約。
// 依頼の文面（`prompt` の `text`）と答えは会話の内容そのものなので、断る理由などに混ぜない。

import { z } from "zod"

import { MAX_CHARACTER_PACK_NAME_LENGTH } from "../character-pack/character.ts"
import { commandBase, EFFORT_LEVELS, MODEL_ALIASES, PERMISSION_MODES } from "../command.ts"
import { FRAME_ERROR_REASON } from "../frame.ts"
import { answerSchema } from "../session-driver/pending-ask.ts"
import {
  MAX_PROMPT_IMAGE_DATA_URL_LENGTH,
  MAX_PROMPT_IMAGE_THUMBNAIL_DATA_URL_LENGTH,
  MAX_PROMPT_IMAGES,
  parsePromptImage,
  parsePromptImageThumbnail,
} from "../session-driver/prompt-image.ts"
import { MAX_SESSION_ID_LENGTH } from "../session/session-choice.ts"
import { SESSION_DEFAULT_PERMISSION_MODES } from "../session/session-default.ts"

/** 依頼として送れる文面の上限。送信のための素朴な上限であって、秘匿・検閲のためではない。 */
export const MAX_PROMPT_TEXT_LENGTH = 20_000

/**
 * 依頼に添える画像1枚。原寸と控えの対。
 * 上限が2つあるのは、2つの寿命が違うから（原寸は送った時点で手放し、記録に残るのは控えだけ）。
 * 文字列のまま持ち、`{ mediaType, base64 }` へのほどきは渡す側が同じ関数で行う。
 */
const promptImageSchema = z.object({
  full: z
    .string()
    .max(MAX_PROMPT_IMAGE_DATA_URL_LENGTH)
    .refine((value) => parsePromptImage(value) !== undefined),
  thumbnail: z
    .string()
    .max(MAX_PROMPT_IMAGE_THUMBNAIL_DATA_URL_LENGTH)
    .refine((value) => parsePromptImageThumbnail(value) !== undefined),
})

export const sessionContract = {
  /** 依頼を送る。 */
  prompt: commandBase.input(
    z.object({
      text: z
        .string()
        .max(MAX_PROMPT_TEXT_LENGTH)
        .refine((text) => text.trim() !== ""),
      // 1枚も無いのが普通なので、field ごと省いた形も受け取って空に畳む（画像を知らない送り手から届いても弾かない）。
      images: z.array(promptImageSchema).max(MAX_PROMPT_IMAGES).readonly().default([]),
    }),
  ),
  /** いまのターンを中断する。 */
  interrupt: commandBase,
  /** 答え待ち（許可要求・質問）に答える。 */
  answer: commandBase.input(z.object({ id: z.string().min(1), answer: answerSchema })),
  setModel: commandBase.input(z.object({ model: z.enum(MODEL_ALIASES) })),
  /**
   * effort を切り替える。セッション限りで、サーバは `applyFlagSettings({ effortLevel })` で SDK へ渡し、受け付けられたら `effort-changed` を流す。
   */
  setEffort: commandBase.input(z.object({ effort: z.enum(EFFORT_LEVELS) })),
  setPermissionMode: commandBase.input(z.object({ mode: z.enum(PERMISSION_MODES) })),
  /**
   * キャラクターから話しかけてもらう。文面はここを通らず、押した事実だけが届く。
   * 送った文面はログにも記録にも残さないので、`prompt` とは別のコマンドにしてある。
   * 雑談のときだけ受ける（仕事のメインビューは記録を積んでレポートを出す面なので、キャラクターから始まるターンを混ぜない）。
   */
  nudge: commandBase.meta({
    chatOnly: FRAME_ERROR_REASON.nudgeOutsideChat,
    idleTurn: FRAME_ERROR_REASON.nudgeDuringTurn,
  }),
  /** キャラクターパックを切り替える（駆動の起こし直し）。 */
  switchCharacter: commandBase
    .meta({ chatOnly: false, idleTurn: FRAME_ERROR_REASON.switchDuringTurn })
    .input(z.object({ name: z.string().min(1).max(MAX_CHARACTER_PACK_NAME_LENGTH) })),
  /**
   * 雑談モードへ入る／出る。駆動の起こし直しになる
   * （`systemPrompt` はセッションを起こすときに固定されるので、レポートの記法を外すには起こし直すしかない）。
   */
  setChatMode: commandBase
    .meta({ chatOnly: false, idleTurn: FRAME_ERROR_REASON.chatModeSwitchDuringTurn })
    .input(z.object({ chat: z.boolean() })),
  /**
   * 続きから始めるセッションを画面から選び直す。
   * 駆動の起こし直しで、変わるのは「どの transcript の続きから始めるか」だけ（キャラクターも雑談かどうかも、いま出しているまま）。
   * ここで見るのは長さだけで、知らないIDは起こす側が新規に倒す。
   */
  switchSession: commandBase
    .meta({ chatOnly: false, idleTurn: FRAME_ERROR_REASON.sessionSwitchDuringTurn })
    .input(z.object({ sessionId: z.string().min(1).max(MAX_SESSION_ID_LENGTH) })),
  /**
   * 新しいセッションを起こす（切り替え画面の「＋ 新しいセッション」）。
   * 駆動の起こし直しで、キャラクターも雑談かどうかもいま出しているまま、続きを探さずに新規で起こす。
   */
  startNewSession: commandBase.meta({
    chatOnly: false,
    idleTurn: FRAME_ERROR_REASON.sessionSwitchDuringTurn,
  }),
  /**
   * 成果の画面から送る、成果の振り返り。
   * 画面は日付（`YYYY-MM-DD`）だけを送り、依頼文はサーバがその日の成果を数え直して組む。
   * 会話のターン中・答え待ちでも受けるので `meta` では断らない（断るかどうかは受け手の中で見る）。
   */
  reflectAchievement: commandBase.input(
    z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  ),
  /**
   * 新しいセッションの既定（モデル・effort・許可モード）を覚える（帯の右端の歯車）。
   * いま動いているセッションには効かず、効くのは次に起こすときから。
   *
   * 3つを1つのコマンドで運ぶのは、覚え先（`~/.tsukumo/state.json`）が1組で書き換わるものだから（1つだけ覚えている状態を作らない）。
   * 「全部許す」は選択肢に無いので、届いても検証で落ちる（`SESSION_DEFAULT_PERMISSION_MODES`）。
   */
  setSessionDefault: commandBase.input(
    z.object({
      model: z.enum(MODEL_ALIASES),
      effort: z.enum(EFFORT_LEVELS),
      permissionMode: z.enum(SESSION_DEFAULT_PERMISSION_MODES),
    }),
  ),
}
