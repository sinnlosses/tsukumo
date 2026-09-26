// セッションのコマンドの契約（`docs/glossary.md`「契約」）。受け手は
// `src/server/session/adapter/session-procedure.ts`、委ね先の行は
// `src/server/session/core/session-command.ts`。駆動へ渡す6種・`nudge`・起こし直し3種・成果の
// 振り返り・新しいセッションの既定の12種。
//
// 依頼の文面（`prompt` の `text`）と答えは会話の内容そのもの（`docs/coding-standards.md`
// 「会話内容の扱い」）。

import { z } from "zod"

import { MAX_CHARACTER_PACK_NAME_LENGTH } from "../character.ts"
import { commandBase, EFFORT_LEVELS, MODEL_ALIASES, PERMISSION_MODES } from "../command.ts"
import { FRAME_ERROR_REASON } from "../frame.ts"
import { answerSchema } from "../pending-ask.ts"
import {
  MAX_PROMPT_IMAGE_DATA_URL_LENGTH,
  MAX_PROMPT_IMAGE_THUMBNAIL_DATA_URL_LENGTH,
  MAX_PROMPT_IMAGES,
  parsePromptImage,
  parsePromptImageThumbnail,
} from "../prompt-image.ts"
import { SESSION_DEFAULT_PERMISSION_MODES } from "../session-default.ts"

/**
 * 依頼として送れる文面の上限。送信のための素朴な上限であって、秘匿・検閲のためではない
 * （旧の入力欄の送信経路にあった `MAX_DISPATCH_TEXT_LENGTH` と同じ値をここへ移した）。
 */
export const MAX_PROMPT_TEXT_LENGTH = 20_000

/**
 * 画面から選び直せるセッションのIDの上限。UUID を通せる素朴な上限であって、形の検査では
 * ない（知らないIDは起こす側が新規に倒すので、ここで形まで縛らない）。
 */
const MAX_SESSION_ID_LENGTH = 200

/**
 * 依頼に添える画像1枚（`docs/requirements.md` 4.10）。原寸と控えの対で、大きさと種類は
 * `src/shared/prompt-image.ts` が見る（受け取るのは `.png` / `.jpg` / `.gif` / `.webp` の4つ
 * だけ。`.svg` は API が取らないので渡せない）。
 *
 * 上限が2つあるのは、2つの寿命が違うから（原寸は送った時点で手放し、記録に残るのは
 * 控えだけ）。文字列のまま持ち、`{ mediaType, base64 }` へのほどきは渡す側
 * （`src/server/session-driver/adapter/sdk-driver.ts`）が同じ関数で行う。
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
      // 添えた画像（`docs/requirements.md` 4.10）。1枚も無いのが普通なので、field ごと
      // 省いた形も受け取って空に畳む（画像を知らない送り手から届いても弾かない）。
      images: z.array(promptImageSchema).max(MAX_PROMPT_IMAGES).readonly().default([]),
    }),
  ),
  /** いまのターンを中断する。 */
  interrupt: commandBase,
  /** 答え待ち（許可要求・質問）に答える。 */
  answer: commandBase.input(z.object({ id: z.string().min(1), answer: answerSchema })),
  setModel: commandBase.input(z.object({ model: z.enum(MODEL_ALIASES) })),
  /**
   * effort を切り替える（`docs/screen-design.md` 13.9「動き方の操作子」）。`setModel` と
   * 同じ形——セッション限りで、サーバは `applyFlagSettings({ effortLevel })` で SDK へ渡す
   * だけ（`src/server/session-driver/adapter/sdk-driver.ts`）。帯に表示する値はこのコマンドで送った値では
   * なく、hook 入力から読み取った値（`effort-changed`。押した値へ先に倒さない。理由は
   * `docs/screen-design.md` 13.9「動き方の操作子」）。
   */
  setEffort: commandBase.input(z.object({ effort: z.enum(EFFORT_LEVELS) })),
  setPermissionMode: commandBase.input(z.object({ mode: z.enum(PERMISSION_MODES) })),
  /**
   * キャラクターから話しかけてもらう（`docs/screen-design.md` 13.7）。文面はここを通らない —
   * 送る一言は `src/server/chat/core/chat-nudge.ts` が持ち、押した事実だけが届く（原則4。話題は
   * tsukumo が列挙しない）。送った文面はログにも記録にも残さないので、
   * `prompt` とは別のコマンドにしてある。雑談のときだけ——仕事のメインビューは記録を積んで
   * レポートを出す面なので、キャラクターから始まるターンを混ぜない。
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
   * 雑談モードへ入る／出る（`docs/chat-mode.md` 4.9）。`switchCharacter` と同じく
   * 駆動の起こし直しになる（`systemPrompt` はセッションを起こすときに固定されるので、
   * レポートの記法を外すには起こし直すしかない）。
   */
  setChatMode: commandBase
    .meta({ chatOnly: false, idleTurn: FRAME_ERROR_REASON.chatModeSwitchDuringTurn })
    .input(z.object({ chat: z.boolean() })),
  /**
   * 続きから始めるセッションを画面から選び直す（`docs/requirements.md` 4.8）。
   * `switchCharacter` と同じく駆動の起こし直しで、変わるのは「どの transcript の続きから
   * 始めるか」だけ（キャラクターも雑談かどうかも、いま出しているまま）。選べるのは
   * `sessions-changed` で届いた一覧の中身（同じパック・同じモードの、目印違い）なので、
   * ここで見るのは長さだけにして、知らないIDは起こす側（`session-launch`）が新規に倒す。
   */
  switchSession: commandBase
    .meta({ chatOnly: false, idleTurn: FRAME_ERROR_REASON.sessionSwitchDuringTurn })
    .input(z.object({ sessionId: z.string().min(1).max(MAX_SESSION_ID_LENGTH) })),
  /**
   * 成果の画面のボタン（と見開きの「この日を振り返る」）から送る、成果の振り返り
   * （`docs/glossary.md`「成果の振り返り」）。画面は日付だけを送る——依頼文は
   * サーバ（`src/server/session/core/session-command.ts`）がその日の成果を数え直して組む（`docs/design.md`「日記の受け取りと
   * 保存」「コマンドと依頼」）。`date` は `YYYY-MM-DD`。会話のターン中・答え待ちでも受けるので
   * `meta` では断らない（断るかどうかは受け手の中で見る）。
   */
  reflectAchievement: commandBase.input(
    z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  ),
  /**
   * 新しいセッションの既定（モデル・effort・許可モード）を覚える（`docs/screen-design.md` 13.6。
   * 帯の右端の歯車）。いま動いているセッションには効かない — 効くのは次に起こすときからで、
   * 帯の `setModel` / `setEffort` / `setPermissionMode`（セッション限り）とは別の口にしてある。
   *
   * 3つを1つのコマンドで運ぶのは、覚え先（`~/.tsukumo/state.json`）が1組で書き換わる
   * ものだから（1つだけ覚えている状態を作らない）。「全部許す」は選択肢に無いので、
   * 届いても検証で落ちる（`SESSION_DEFAULT_PERMISSION_MODES`。`src/shared/session-default.ts`）。
   * effort は除外する値が無いので `EFFORT_LEVELS` をそのまま受け付ける。
   */
  setSessionDefault: commandBase.input(
    z.object({
      model: z.enum(MODEL_ALIASES),
      effort: z.enum(EFFORT_LEVELS),
      permissionMode: z.enum(SESSION_DEFAULT_PERMISSION_MODES),
    }),
  ),
}
