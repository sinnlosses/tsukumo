// `<CharacterEdit>` の文言と、顔・ミニ立ち絵・背景に選べる種類の表。

import { MAX_BACKGROUND_BYTES } from "../../../../../shared/character-pack/character-background.ts"
import type { CharacterPackRemoval } from "../../../../../shared/character-pack/character.ts"
import { MAX_PORTRAIT_BYTES } from "../../../../../shared/character-pack/portrait-image.ts"
import { FRAME_ERROR_REASON } from "../../../../../shared/frame.ts"
import { MAX_ITEM_NAME_LENGTH, MAX_ITEMS, type SeatKey } from "../../../../../shared/item/item.ts"

/** 背景の行の、いまの状態を表す字（印だけにしない）。 */
export const BACKGROUND_LABEL = { present: "いまの背景", absent: "背景なし" } as const

/** 顔の行の、いまの状態を表す字（印だけにしない）。 */
export const FACE_LABEL = { present: "いまの顔", absent: "顔なし" } as const

/** ミニ立ち絵の行の、いまの状態を表す字。持たないときは、いつもの立ち絵を縮めて使うことを言う。 */
export const MINI_LABEL = {
  present: "いまのミニ立ち絵",
  absent: "いつもの立ち絵を縮めて使う",
} as const

/** ミニ立ち絵に選べる種類。立ち絵と同じ。 */
export const MINI_FILE_ACCEPT = ".svg,.png,.gif"

/** 顔に選べる種類。中身の検証はサーバ側で、ここは選ぶときの絞り込みだけ。 */
export const FACE_FILE_ACCEPT = ".svg,.png,.gif"

/** 背景に選べる種類。`.gif` は入れない（動く背景は読む面の隣で気が散る）。 */
export const BACKGROUND_FILE_ACCEPT = ".png,.jpg,.jpeg,.webp"

/**
 * 画像の書き込みを断られたときに、その欄に出す一言。
 * 断りの理由はサーバから分けて返らないので、受け付ける種類と大きさを並べて言う。
 */
export const IMAGE_REJECTED_NOTE = {
  face: `差し替えられなかった。顔は SVG・PNG・GIF の ${mebibytes(MAX_PORTRAIT_BYTES)} までの画像にしてほしい`,
  mini: `差し替えられなかった。ミニ立ち絵は SVG・PNG・GIF の ${mebibytes(MAX_PORTRAIT_BYTES)} までの画像にしてほしい`,
  background: `差し替えられなかった。背景は PNG・JPEG・WebP の ${mebibytes(MAX_BACKGROUND_BYTES)} までの画像にしてほしい`,
  portrait: (label: string): string =>
    `${label}を差し替えられなかった。立ち絵は SVG・PNG・GIF の ${mebibytes(MAX_PORTRAIT_BYTES)} までの画像にしてほしい`,
} as const

/** 作るダイアログの立ち絵が上限を超えていたとき、選んだ時点で枠の下に出す一言。 */
export const CREATE_PORTRAIT_TOO_LARGE_NOTE = `置けなかった。立ち絵は SVG・PNG・GIF の ${mebibytes(MAX_PORTRAIT_BYTES)} までの画像にしてほしい`

/** 必須の1つ（`default`）のカードに添える札。どの表情が「いつもの顔」かを字で出す。 */
export const DEFAULT_EXPRESSION_BADGE = "いつもの顔"

/** 画面から変えられないパックのときに出す一言。 */
export const NOT_EDITABLE_NOTE = "起動先の characters/local のパックは、画面からは変えられない"

// 切り替えは起こし直し（会話が消える）なので、`restartRefused` の間は塞ぐ。
// 理由の文面はサーバが断るときと同じ定型文を使う。
export const SWITCH_BLOCKED_TITLE = FRAME_ERROR_REASON.switchDuringTurn

/**
 * 帯とダイアログの文言を `removal` の2値（`"none"` は帯を出さないので含まない）で出し分ける。
 * 同梱を直したパックは「消す」ではなく「同梱に戻す」と見せる。
 * 活用は動的に作らず全部書き下す。
 * `verb`（辞書形。帯とダイアログの実行ボタン）・`dialogQuestion`（丁寧形の問い）・`blockedTitle`（可能形。使用中で押せないときの理由）は同じ動詞でも形が違うため。
 */
export const DELETE_COPY = {
  delete: {
    heading: "このキャラクターを消す",
    note: "表情・差し色・背景もいっしょに消えます。使用中のキャラクターは、先に別のキャラクターに切り替えてから消せます。",
    verb: "消す",
    dialogQuestion: "消しますか？",
    dialogNote: (portraitCount: number): string =>
      `表情 ${String(portraitCount)} 枚・差し色・背景もいっしょに消えます。\n消したあとは元に戻せません。`,
    blockedTitle: "使用中のキャラクターは、先に別のキャラクターに切り替えてから消せます",
  },
  "revert-to-bundled": {
    heading: "同梱に戻す",
    note: "画面で直した見た目と、覚えたことが消え、同梱の元の姿に戻ります。使用中のキャラクターは、先に別のキャラクターに切り替えてから戻せます。",
    verb: "同梱に戻す",
    dialogQuestion: "同梱に戻しますか？",
    dialogNote: (): string =>
      "画面で直した見た目と、覚えたことが消えます。\n会話の記録は残ります。",
    blockedTitle: "使用中のキャラクターは、先に別のキャラクターに切り替えてから戻せます",
  },
} as const satisfies Record<
  Exclude<CharacterPackRemoval, "none">,
  {
    readonly heading: string
    readonly note: string
    readonly verb: string
    readonly dialogQuestion: string
    readonly dialogNote: (portraitCount: number) => string
    readonly blockedTitle: string
  }
>

/** アイテムの区画の見出しの下の一言。一覧は共通で、席はキャラクターごとと言う。 */
export const ITEM_LEAD = "一覧はどのキャラクターにも共通で、席はこのキャラクターだけのものです"

/** 席の札の字。 */
export const SEAT_LABEL = {
  topLeft: "左上",
  belowLeft: "キャラの左下",
  belowRight: "キャラの右下",
} as const satisfies Record<SeatKey, string>

/** 席の選び口の先頭（何も置かない）。 */
export const SEAT_EMPTY_OPTION = "置かない"

export const ITEM_ADD_FULL_TITLE = `アイテムは ${String(MAX_ITEMS)} 個まで。足すには先にどれかを消してください`

/** 足すダイアログで断られたときの一言。理由は分けて返らないので、受け付ける条件を並べて言う。 */
export const ITEM_ADD_REJECTED_NOTE = `足せなかった。名前は ${String(MAX_ITEM_NAME_LENGTH)} 字までで、画像は SVG・PNG・GIF の ${mebibytes(MAX_PORTRAIT_BYTES)} までにしてほしい`

function mebibytes(bytes: number): string {
  return `${String(bytes / (1024 * 1024))} MiB`
}
