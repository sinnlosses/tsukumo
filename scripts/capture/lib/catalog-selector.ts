// 状態のカタログが、撮る前に待つ・送る・押す要素を指すセレクタ。

import { MAIN_REGION_SELECTOR } from "./capture-page.ts"

/** 本文が入る領域の中で、領域の外まではみ出して1枚に入らないもの（疑似セッションの `notation`）。 */
export const MERMAID_SELECTOR = `${MAIN_REGION_SELECTOR} svg`
export const CHART_SELECTOR = `${MAIN_REGION_SELECTOR} canvas`
/**
 * `note` の種別の並びのうちいちばん上に出るもの（情報）。ここまで送ると、続く注意・異常・
 * 疑問・メモが1枚に収まる（お願いだけは規約でレポートの末尾に置くので別の1枚になる）。
 * class 名は組み立てのたびにハッシュ化される（`report-note_nkMPPQ`）ので、種別の印
 * （`report-note-warn` など）を巻き込まないよう区切りの `_` まで含めて前方一致で指す
 * （`docs/architecture/testing.md`「手で確かめること」）。
 */
export const NOTE_KINDS_SELECTOR = `${MAIN_REGION_SELECTOR} [class*="report-note_"]`
/** お願いの塊（レポートの末尾）。 */
/** メモの塊。狭い窓では種別の並びの1枚（`notation-note`）に入りきらない。 */
export const NOTE_MEMO_SELECTOR = `${MAIN_REGION_SELECTOR} [class*="report-note-memo_"]`
export const NOTE_FAVOR_SELECTOR = `${MAIN_REGION_SELECTOR} [class*="report-note-favor_"]`
/** 番号つきの題を持つ図と表の包み。 */
export const CAPTIONED_SELECTOR = `${MAIN_REGION_SELECTOR} [class*="report-captioned_"]`
export const CAPTIONED_FIGURE_SELECTOR = `${CAPTIONED_SELECTOR} pre.mermaid svg`
export const IMAGE_NOTES_SELECTOR = `${MAIN_REGION_SELECTOR} [class*="report-image-notes_"]`
/** 前後の塊（`report-before-after` 場面の先頭は画像の前後）と、その中の最初のコード・箇条。 */
export const BEFORE_AFTER_SELECTOR = `${MAIN_REGION_SELECTOR} [class*="report-before-after_"]`
export const BEFORE_AFTER_CODE_SELECTOR = `${BEFORE_AFTER_SELECTOR} pre`
export const BEFORE_AFTER_POINTS_SELECTOR = `${BEFORE_AFTER_SELECTOR} ul`

/** 印つきの `graph` を包む図（`report-before-after` 場面の構造の変更の節。凡例を持つ包み）。 */
export const GRAPH_LEGEND_SELECTOR = `${MAIN_REGION_SELECTOR} [class*="report-captioned"]:has([class*="report-graph-legend_"])`
/** 質問の選択肢の preview に書いた画像（`question-preview-image` 場面の横長の画像と、描かない画像の札）。 */
export const PREVIEW_IMAGE_SELECTOR = `${MAIN_REGION_SELECTOR} img[alt="架空の横長の画面"]`
export const PREVIEW_IMAGE_MISSING_SELECTOR = `${MAIN_REGION_SELECTOR} [role="img"][aria-label="架空の外部の画像"]`
/** `list` の `flow`（一本道の手順）。 */
export const FLOW_SELECTOR = `${MAIN_REGION_SELECTOR} [class*="report-flow_"]`
/**
 * 検証結果の表（`report` の `checks`）。class 名でなく role・aria-label で指す
 * （面の `ChecksVerdict` が組む `<div role="table" aria-label="検証結果">` の属性はハッシュ化されない）。落ちた・確かめていない項目は「検証結果の問題」の表で開いて見え、
 * 通った項目は「検証結果」の表で `<details>` の中に畳まれる。
 */
export const CHECKS_SELECTOR = `${MAIN_REGION_SELECTOR} [role="table"][aria-label^="検証結果"]`
/** ファイル名の帯つきの diff の塊。帯と `pre` を包む器を指す。 */
export const DIFF_SELECTOR = `${MAIN_REGION_SELECTOR} [class*="code-file_"]`
/** 結論のすぐ下の合図の行（`mainViewTurns` が組む。総括行・問題の項目・通った項目の畳みを含む検証結果の塊）。 */
export const VERDICT_SELECTOR = `${MAIN_REGION_SELECTOR} [role="group"][aria-label="検証結果"]`

/** 最終レポートのある閉じたやり取りの経過の畳み（`<details>`）の `<summary>`。 */
export const PROGRESS_FOLD_SUMMARY_SELECTOR = `${MAIN_REGION_SELECTOR} details[class*="progress-fold_"] > summary`

/** 最終レポートの器。最終 `report` が届くまで現れず、中間レポートの器（`is-interim`）とは別。 */
export const WORK_PLAN_FINAL_SELECTOR = `${MAIN_REGION_SELECTOR} [class*="is-final_"]`

/** 日記帳の見開きの右ページの本文。白紙のページは別の class なので、日記が書けていないと現れない。 */
export const DIARY_BODY_SELECTOR = '[class*="diary-book-body_"]'

/** 入力欄。ページに `<textarea>` は1つしか無い。 */
export const COMPOSER_SELECTOR = "textarea"

/**
 * 狭い窓でだけ出る引き出しを開く口と、その中のタスクのタブ。タスク一覧を開く口もある。
 * 広い窓では引き出しの口もタブも出ないので、この2手は空振りする
 * （空振りは飛ばして次の手へ進む。`applyPreparations` の `continue`）。
 */
export const DRAWER_TOGGLE_SELECTOR = '[aria-label="やり取りとタスクを開く"]'
export const DRAWER_TASKS_TAB_SELECTOR = '[role="tab"]:has-text("タスク")'
export const TASK_BOARD_SELECTOR = 'button:has-text("一覧を見る")'

/**
 * 帯の「いまの作業」の外枠（`data-work-state` を持つ div）の中の押す口（`CurrentWorkPill`）。
 * 見えているものだけを `:visible` で絞る。狭い画面には帯の札が無いので、この手は空振りする
 * （`applyPreparations` の `continue` が当たらなかった手を飛ばす）。
 */
export const WORK_TOGGLE_SELECTOR = "[data-work-state] button[aria-controls]:visible"

/**
 * 書き終わりの知らせ（`DiaryNotice`）の「日記帳で開く」。成果の画面（`#achievement`）
 * だけに出る（`App` の `<Activity>`）。
 */
export const DIARY_NOTICE_OPEN_SELECTOR = 'button:has-text("日記帳で開く")'

/**
 * キャラクター画面、表情のカードの「消す」（`PortraitCard`）。見える字は無くアイコン
 * だけなので `title` で当てる。
 */
export const PORTRAIT_CLEAR_BUTTON_SELECTOR = 'button[title="消す"]'

/** キャラクター画面、最下部の「このキャラクターを消す」帯のボタン（`CharacterDelete`）。 */
export const CHARACTER_DELETE_BAND_BUTTON_SELECTOR = 'button:has-text("を消す")'
