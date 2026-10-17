// 状態のカタログが撮る場面の定義。ここに足すときは疑似セッションに場面を足して、
// その名前と、撮る前に当てる操作を書く。

import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { MAIN_REGION_SELECTOR } from "./capture-page.ts"
import type { Preparation } from "./capture-preparation.ts"

/**
 * 撮る前に、その件専用の `TSUKUMO_HOME` へ置いておくもの。既定のホーム（利用者の
 * `~/.tsukumo/`）には触らない——日記帳の見開きや、画面から消せるキャラクターパックは
 * 中身が無いと出せないので、`--out` の下に立てた件専用のホームへだけ書く
 * （`applyHomeSetup`）。
 *
 * - `default`: 何もしない（既定のホームのまま起こす。ほとんどの件はこれ）
 * - `diary`: 架空の日記を1件書いてから起こす（`appendDiaryParagraph`。日記帳の見開きを見る件）
 * - `character`: 同梱の `chou` を別名でコピーしたパックを置いてから起こす（画面から消せる
 *   パックが要る件——ホームにしか無いパックだけが `removal: "delete"` になる。
 *   `characterPackRemoval`）
 */
export type HomeSetup =
  | { readonly kind: "default" }
  | { readonly kind: "diary"; readonly date: string; readonly body: string }
  | { readonly kind: "character"; readonly pack: string }

/**
 * tsukumo を起こす作業場所（cwd）。レポートが相対パスで指すファイルは、ここから読まれる。
 * リポジトリの根には書かない。
 *
 * - `repository`: リポジトリの根で起こす（ほとんどの件はこれ。何も置かない）
 * - `report-image`: `--out` の下に件専用の場所を立て、`report-image`・`report-before-after`・`question-preview-image` の場面が指す画像
 *   （架空の PNG）を置いてから、そこで起こす
 * - `task-list`: `--out` の下に件専用の場所を立て、`.tsukumo/fake-beads-issues.json` に架空の課題を置いてから、
 *   そこで起こす（最終レポートのタスクIDがリンクになるのは、タスクの一覧にその ID があるとき）
 */
type WorkspaceSetup =
  | { readonly kind: "repository" }
  | { readonly kind: "report-image" }
  | { readonly kind: "task-list" }

/**
 * 場面が撮れる状態まで落ち着くのを待つやり方。
 * `scene-end` は、場面の最後の手が画面へ届くまで。
 * `scene-event` は、場面の途中の状態を撮る件が、`eventKind` のイベントが `occurrence` 件目まで届くまで
 * （数え方は `sceneEndTarget` と同じで、opening の手も数える）。
 * `selector` は要素が現れるまで。`phase` は `prepare` の前に待つか後に待つか
 * （操作で初めて出る要素は `after-prepare`）。
 * どれも上限まで届かなければ撮らずに落とす。
 */
export type Settle =
  | { readonly kind: "scene-end" }
  | {
      readonly kind: "scene-event"
      readonly eventKind: SessionEvent["kind"]
      readonly occurrence: number
    }
  | {
      readonly kind: "selector"
      readonly selector: string
      readonly phase: "before-prepare" | "after-prepare"
    }

const SCENE_END_SETTLE = { kind: "scene-end" } satisfies Settle

/**
 * カタログの1件。`scene` は疑似セッション（test/fixture/fake-session.json）の場面の名前で、`name` は
 * 画像のファイル名と `--only` の名指しに使う一意の名前（同じ場面を別の操作で何枚も撮るので、
 * 場面の名前では足りない）。
 *
 * `skipReveal` は、撮る前に「書き上げていくように見せる演出」
 * （`useReportReveal`）を着地させておくか。長いレポートの場合、演出が終わるまで約15秒かかり、
 * そのあいだ演出自身の自動送りが筆先を追い続けて器を送るので、こちらが `scroll` で送った位置を
 * フレームごとに引き戻される（図・グラフは演出のいちばん最後に出る塊で、演出中はまだ見えていない）。
 * 演出はクリックとキー入力で打ち切れる（`SKIP_EVENT_NAMES`）。`true` の件は、`prepare` を当てる前に
 * スクリプトがキーを1つ打って演出を終わらせてから送る。既定は `false`（打ち切らなくても待ち時間が
 * 変わらない件）。
 *
 * 演出中の要素は `clip-path` で隠すだけで DOM に残るので、`settle` の `selector` は
 * 書き上がったことまでは確かめない（書き上げるのは `skipReveal`）。
 */
export type CatalogEntry = {
  readonly name: string
  readonly scene: string
  readonly label: string
  readonly homeSetup: HomeSetup
  readonly workspaceSetup: WorkspaceSetup
  readonly prepare: readonly Preparation[]
  readonly skipReveal: boolean
  readonly settle: Settle
}

/** 本文が入る領域の中で、領域の外まではみ出して1枚に入らないもの（疑似セッションの `notation`）。 */
const MERMAID_SELECTOR = `${MAIN_REGION_SELECTOR} svg`
const CHART_SELECTOR = `${MAIN_REGION_SELECTOR} canvas`
/**
 * `note` の種別の並びのうちいちばん上に出るもの（情報）。ここまで送ると、続く注意・異常・
 * 疑問・メモが1枚に収まる（お願いだけは規約でレポートの末尾に置くので別の1枚になる）。
 * class 名は組み立てのたびにハッシュ化される（`report-note_nkMPPQ`）ので、種別の印
 * （`report-note-warn` など）を巻き込まないよう区切りの `_` まで含めて前方一致で指す
 * （`docs/architecture/testing.md`「手で確かめること」）。
 */
const NOTE_KINDS_SELECTOR = `${MAIN_REGION_SELECTOR} [class*="report-note_"]`
/** お願いの塊（レポートの末尾）。 */
/** メモの塊。狭い窓では種別の並びの1枚（`notation-note`）に入りきらない。 */
const NOTE_MEMO_SELECTOR = `${MAIN_REGION_SELECTOR} [class*="report-note-memo_"]`
const NOTE_FAVOR_SELECTOR = `${MAIN_REGION_SELECTOR} [class*="report-note-favor_"]`
/** 番号つきの題を持つ図と表の包み・寸法図。 */
const CAPTIONED_SELECTOR = `${MAIN_REGION_SELECTOR} [class*="report-captioned_"]`
const CAPTIONED_FIGURE_SELECTOR = `${CAPTIONED_SELECTOR} pre.mermaid svg`
const DIMENSION_SELECTOR = `${MAIN_REGION_SELECTOR} [class*="report-dimension_"]`
const IMAGE_NOTES_SELECTOR = `${MAIN_REGION_SELECTOR} [class*="report-image-notes_"]`
/** 前後の塊（`report-before-after` 場面の先頭は画像の前後）と、その中の最初のコード・箇条。 */
const BEFORE_AFTER_SELECTOR = `${MAIN_REGION_SELECTOR} [class*="report-before-after_"]`
const BEFORE_AFTER_CODE_SELECTOR = `${BEFORE_AFTER_SELECTOR} pre`
const BEFORE_AFTER_POINTS_SELECTOR = `${BEFORE_AFTER_SELECTOR} ul`

/** 印つきの `graph` を包む図（`report-before-after` 場面の構造の変更の節。凡例を持つ包み）。 */
const GRAPH_LEGEND_SELECTOR = `${MAIN_REGION_SELECTOR} [class*="report-captioned"]:has([class*="report-graph-legend_"])`
/** 質問の選択肢の preview に書いた画像（`question-preview-image` 場面の横長の画像と、描かない画像の札）。 */
const PREVIEW_IMAGE_SELECTOR = `${MAIN_REGION_SELECTOR} img[alt="架空の横長の画面"]`
const PREVIEW_IMAGE_MISSING_SELECTOR = `${MAIN_REGION_SELECTOR} [role="img"][aria-label="架空の外部の画像"]`
/** `list` の `flow`（一本道の手順）。 */
const FLOW_SELECTOR = `${MAIN_REGION_SELECTOR} [class*="report-flow_"]`
/**
 * 検証結果の表（`report` の `checks`）。class 名でなく role・aria-label で指す
 * （`reportChecksMarkdown` が組む `<div role="table" aria-label="検証結果">`
 * の属性はハッシュ化されない）。落ちた・確かめていない項目は「検証結果の問題」の表で開いて見え、
 * 通った項目は「検証結果」の表で `<details>` の中に畳まれる。
 */
const CHECKS_SELECTOR = `${MAIN_REGION_SELECTOR} [role="table"][aria-label^="検証結果"]`
/** 結論のすぐ下の合図の行（`mainViewTurns` が組む。総括行・問題の項目・通った項目の畳みを含む検証結果の塊）。 */
const VERDICT_SELECTOR = `${MAIN_REGION_SELECTOR} [role="group"][aria-label="検証結果"]`

/** 最終レポートの器。最終 `report` が届くまで現れず、中間レポートの器（`is-interim`）とは別。 */
const WORK_PLAN_FINAL_SELECTOR = `${MAIN_REGION_SELECTOR} [class*="is-final_"]`

/** 日記帳の見開きの右ページの本文。白紙のページは別の class なので、日記が書けていないと現れない。 */
const DIARY_BODY_SELECTOR = '[class*="diary-book-body_"]'

/** 入力欄。ページに `<textarea>` は1つしか無い。 */
const COMPOSER_SELECTOR = "textarea"

/**
 * 狭い窓でだけ出る引き出しを開く口と、その中のタスクのタブ。タスク一覧を開く口もある。
 * 広い窓では引き出しの口もタブも出ないので、この2手は空振りする
 * （空振りは飛ばして次の手へ進む。`applyPreparations` の `continue`）。
 */
const DRAWER_TOGGLE_SELECTOR = '[aria-label="やり取りとタスクを開く"]'
const DRAWER_TASKS_TAB_SELECTOR = '[role="tab"]:has-text("タスク")'
const TASK_BOARD_SELECTOR = 'button:has-text("一覧を見る")'

/**
 * 帯の「いまの作業」の外枠（`data-work-state` を持つ div）の中の押す口（`CurrentWorkPill`）。
 * 見えているものだけを `:visible` で絞る。狭い画面には帯の札が無いので、この手は空振りする
 * （`applyPreparations` の `continue` が当たらなかった手を飛ばす）。
 */
const WORK_TOGGLE_SELECTOR = "[data-work-state] button[aria-controls]:visible"

/**
 * 書き終わりの知らせ（`DiaryNotice`）の「日記帳で開く」。成果の画面（`#achievement`）
 * だけに出る（`App` の `<Activity>`）。
 */
const DIARY_NOTICE_OPEN_SELECTOR = 'button:has-text("日記帳で開く")'

/**
 * キャラクター画面、表情のカードの「消す」（`PortraitCard`）。見える字は無くアイコン
 * だけなので `title` で当てる。
 */
const PORTRAIT_CLEAR_BUTTON_SELECTOR = 'button[title="消す"]'

/** キャラクター画面、最下部の「このキャラクターを消す」帯のボタン（`CharacterDelete`）。 */
const CHARACTER_DELETE_BAND_BUTTON_SELECTOR = 'button:has-text("を消す")'

/**
 * {@link HomeSetup} の `character` が置くパックのディレクトリ名。同梱の `chou` とは別名にして、
 * 「ホームにしか無いパック」（`removal: "delete"`）にする。 */
const SAMPLE_CHARACTER_PACK_NAME = "chou-sample"

/** {@link HomeSetup} の `diary` が書く日（`diary-written` 場面が書く日付と揃える）。 */
const DIARY_FIXTURE_DATE = "2026-09-20"

/** {@link HomeSetup} の `diary` が書く本文。架空の日記で、実物の記録ではない。 */
const DIARY_FIXTURE_BODY =
  "今日は日記帳の見開きを撮るための架空の日記。実物の作業内容は含まない。" +
  "ダミーの振り返りとして、架空のタスクを1件終えたことにしてある。"

/**
 * 並べて見たい状態。網羅はしない — 直したときに崩れやすい場所（答え待ちの箱・ツールの進行・
 * レポートの記法・補完の候補・キャラクター画面）だけを選ぶ。足すときは疑似セッションに場面を足して、
 * その名前と、撮る前に当てる操作をここに書く。
 */
export const CATALOG: readonly CatalogEntry[] = [
  {
    name: "question-multi",
    scene: "question-multi",
    label: "質問（複数選択）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "question-pair",
    scene: "question-pair",
    label: "質問（2問・長い説明）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "question-long",
    scene: "question-long",
    label: "質問（長いラベルと長い説明・複数選択と単一選択）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "question-preview",
    scene: "question-preview",
    label: "質問（選択肢ごとの preview を札の中、説明の下に出す）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "question-brief",
    scene: "question-brief",
    label: "質問（背景と判断の軸・左に選択肢・右に詳細・下に畳める比較表）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "question-preview-image",
    scene: "question-preview-image",
    label:
      "質問（preview に書いた手元の画像が札の幅に収まって出る。縦長の画像は高さの上限で止まる）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "report-image" },
    prepare: [
      { kind: "wait", selector: `${MAIN_REGION_SELECTOR} label:has-text("横長の案")` },
      { kind: "click", selector: `${MAIN_REGION_SELECTOR} label:has-text("横長の案")` },
      { kind: "scroll", selector: PREVIEW_IMAGE_SELECTOR },
    ],
    skipReveal: false,
    settle: { kind: "selector", selector: PREVIEW_IMAGE_SELECTOR, phase: "after-prepare" },
  },
  {
    name: "question-preview-image-missing",
    scene: "question-preview-image",
    label: "質問（preview の外部の URL・data:・置いていない画像は「画像を出せない」の札になる）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "report-image" },
    prepare: [
      { kind: "wait", selector: `${MAIN_REGION_SELECTOR} label:has-text("外の画像の案")` },
      { kind: "click", selector: `${MAIN_REGION_SELECTOR} label:has-text("外の画像の案")` },
      { kind: "scroll", selector: PREVIEW_IMAGE_MISSING_SELECTOR },
    ],
    skipReveal: false,
    settle: { kind: "selector", selector: PREVIEW_IMAGE_MISSING_SELECTOR, phase: "after-prepare" },
  },
  {
    name: "permission",
    scene: "permission",
    label: "許可プロンプト",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "report",
    scene: "report",
    label: "レポートとツールの進行",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "report-checks",
    // 検証結果は2件目の `report`（3状態を混ぜてある）にしか無く、約7秒後まで現れない。
    scene: "report-tool",
    label: "検証結果の表（ok・ng・unverified）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "scroll", selector: CHECKS_SELECTOR }],
    skipReveal: true,
    settle: { kind: "selector", selector: CHECKS_SELECTOR, phase: "before-prepare" },
  },
  {
    name: "report-task-finished",
    scene: "report-task-finished",
    label: "最終レポートの目録の1行（タスクIDのリンクの点線の下線・「完了」の札）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "task-list" },
    prepare: [],
    skipReveal: true,
    settle: {
      kind: "selector",
      selector: `${MAIN_REGION_SELECTOR} [class*="report-task-id-link"]`,
      phase: "before-prepare",
    },
  },
  {
    name: "report-verdict",
    // 転がさずに撮り、最初の1画面に結論と合図の行が入っているかを見る。
    scene: "report-task-verdict",
    label: "合図の行（確かめていない項目が1つあり、お願いがある）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: true,
    settle: { kind: "selector", selector: VERDICT_SELECTOR, phase: "before-prepare" },
  },
  {
    name: "report-verdict-open",
    scene: "report-task-verdict",
    label: "合図の行（畳んだ通った項目を開いた）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "click", selector: `${VERDICT_SELECTOR} summary` }],
    skipReveal: true,
    settle: { kind: "selector", selector: VERDICT_SELECTOR, phase: "before-prepare" },
  },
  {
    name: "turn-history",
    scene: "turn-history",
    label: "ターンの札（4件）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "notation",
    scene: "notation",
    label: "レポートの記法（引用・表・注意）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: true,
    settle: SCENE_END_SETTLE,
  },
  // 記法の見本は領域に1枚ぶんが入らない（1400x900 で 1358px のうち 855px が領域の外）。
  // 領域を伸ばして1枚にすると他の領域が重なって本番と別の姿になるので、送って複数枚に分ける。
  {
    name: "notation-note",
    scene: "notation",
    label: "レポートの記法（note の種別。領域を送った先）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "scroll", selector: NOTE_KINDS_SELECTOR }],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "notation-memo",
    scene: "notation",
    label: "レポートの記法（メモ。領域を送った先）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "scroll", selector: NOTE_MEMO_SELECTOR }],
    skipReveal: true,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "notation-favor",
    scene: "notation",
    label: "レポートの記法（お願い。領域を送った先）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "scroll", selector: NOTE_FAVOR_SELECTOR }],
    // お願いはレポートの末尾なので、図と同じく演出が終わるまで送り位置を戻され続ける。
    skipReveal: true,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "notation-figure",
    scene: "notation",
    label: "レポートの記法（図。領域を送った先）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "scroll", selector: MERMAID_SELECTOR }],
    // 図はレポートの末尾に近く、演出が終わるまで自動送りに送り位置を戻され続ける（冒頭の
    // `skipReveal` の説明）。
    skipReveal: true,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "notation-chart",
    scene: "notation",
    label: "レポートの記法（グラフ。領域を送った先）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "scroll", selector: CHART_SELECTOR }],
    skipReveal: true,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "report-caption-table",
    scene: "report-caption",
    label: "図と表の題（表の題は本体の上。長い題は本体の幅で折り返す）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "scroll", selector: CAPTIONED_SELECTOR }],
    skipReveal: true,
    settle: { kind: "selector", selector: CAPTIONED_SELECTOR, phase: "before-prepare" },
  },
  {
    name: "report-caption-figure",
    scene: "report-caption",
    label: "図と表の題（図の題は本体の下。mermaid・グラフ）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "scroll", selector: CAPTIONED_FIGURE_SELECTOR }],
    skipReveal: true,
    settle: { kind: "selector", selector: CAPTIONED_FIGURE_SELECTOR, phase: "before-prepare" },
  },
  {
    name: "report-caption-dimension",
    scene: "report-caption",
    label: "図と表の題（見比べ・寸法図・画像）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "scroll", selector: DIMENSION_SELECTOR }],
    skipReveal: true,
    settle: { kind: "selector", selector: CAPTIONED_SELECTOR, phase: "before-prepare" },
  },
  {
    name: "report-figure",
    scene: "report-figure",
    label: "レポートの図の欄（検証結果の下に図 1、節の図は図 2）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: true,
    settle: { kind: "selector", selector: CAPTIONED_SELECTOR, phase: "before-prepare" },
  },
  {
    name: "report-tall-figure",
    scene: "report-tall-figure",
    label: "縦に長い図（mermaid・svg・画像）が読む面の 70% までに収まる",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "report-image" },
    prepare: [],
    skipReveal: true,
    settle: { kind: "selector", selector: CAPTIONED_SELECTOR, phase: "before-prepare" },
  },
  {
    name: "report-interim-nested",
    scene: "report-interim-nested",
    label: "中間レポートの箱の中の塊に枠が無く、箱が1段になる",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [
      { kind: "wait", selector: `${MAIN_REGION_SELECTOR} summary` },
      { kind: "click", selector: `${MAIN_REGION_SELECTOR} summary` },
    ],
    skipReveal: true,
    settle: {
      kind: "selector",
      selector: `${MAIN_REGION_SELECTOR} [class*="report-stat_"]`,
      phase: "after-prepare",
    },
  },
  {
    name: "report-figure-none",
    scene: "report-figure-none",
    label: "レポートの図の欄が none（何も描かず、節の図が図 1）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: true,
    settle: { kind: "selector", selector: CAPTIONED_SELECTOR, phase: "before-prepare" },
  },
  {
    name: "report-image-notes",
    scene: "report-image",
    label: "画像に番号つきの説明を添えた塊（画像が読めて、説明が番号つきで並ぶ）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "report-image" },
    prepare: [{ kind: "scroll", selector: IMAGE_NOTES_SELECTOR }],
    skipReveal: true,
    settle: { kind: "selector", selector: IMAGE_NOTES_SELECTOR, phase: "before-prepare" },
  },
  {
    name: "report-before-after-image",
    scene: "report-before-after",
    label: "前後の塊（画像の前後。前が左・後が右・間に矢印）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "report-image" },
    prepare: [{ kind: "scroll", selector: BEFORE_AFTER_SELECTOR }],
    skipReveal: true,
    settle: { kind: "selector", selector: BEFORE_AFTER_SELECTOR, phase: "before-prepare" },
  },
  {
    name: "report-before-after-code",
    scene: "report-before-after",
    label: "前後の塊（コードの前後と箇条の前後）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "report-image" },
    prepare: [{ kind: "scroll", selector: BEFORE_AFTER_CODE_SELECTOR }],
    skipReveal: true,
    settle: { kind: "selector", selector: BEFORE_AFTER_CODE_SELECTOR, phase: "before-prepare" },
  },
  {
    name: "report-before-after-points",
    scene: "report-before-after",
    label: "前後の塊（箇条の前後と、箇条から置いていない画像への前後）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "report-image" },
    prepare: [{ kind: "scroll", selector: BEFORE_AFTER_POINTS_SELECTOR }],
    skipReveal: true,
    settle: { kind: "selector", selector: BEFORE_AFTER_POINTS_SELECTOR, phase: "before-prepare" },
  },
  {
    name: "report-graph-change",
    scene: "report-before-after",
    label: "印つきの graph（足した・消した・変えたの色と凡例）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "report-image" },
    prepare: [{ kind: "scroll", selector: GRAPH_LEGEND_SELECTOR }],
    skipReveal: true,
    settle: { kind: "selector", selector: GRAPH_LEGEND_SELECTOR, phase: "before-prepare" },
  },
  {
    name: "report-image-missing",
    scene: "report-image",
    label: "画像に番号つきの説明を添えた塊（画像を置いていないので「出せない」の札が出る）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "scroll", selector: IMAGE_NOTES_SELECTOR }],
    skipReveal: true,
    settle: { kind: "selector", selector: IMAGE_NOTES_SELECTOR, phase: "before-prepare" },
  },
  {
    name: "notation-flow",
    scene: "notation",
    label: "レポートの記法（流れ。領域を送った先）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "scroll", selector: FLOW_SELECTOR }],
    skipReveal: true,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "task-board",
    scene: "report",
    label: "タスク一覧のモーダル",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [
      { kind: "click", selector: DRAWER_TOGGLE_SELECTOR },
      { kind: "click", selector: DRAWER_TASKS_TAB_SELECTOR },
      { kind: "click", selector: TASK_BOARD_SELECTOR },
    ],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "command-suggestions",
    scene: "report",
    label: "「/」のコマンド補完",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "type", selector: COMPOSER_SELECTOR, text: "/c" }],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "file-suggestions",
    scene: "report",
    label: "「@」のファイル補完",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "type", selector: COMPOSER_SELECTOR, text: "@src/browser/" }],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "character-screen",
    scene: "report",
    label: "キャラクター画面",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "hash", hash: "#character" }],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "character-create",
    scene: "report",
    label: "キャラクターを作る画面",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [
      { kind: "hash", hash: "#character" },
      { kind: "click", selector: `[class*="character-list-new_"]` },
    ],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  // 帯の「いまの作業」の3状態（`docs/architecture/testing.md`「手で確かめること」）。どれも
  // `WORK_TOGGLE_SELECTOR` を押して一覧を開く。
  {
    name: "current-work-running",
    // 自分の `request` を持つ場面（`test/fixture/fake-session.json`）なので、名指しで
    // 直接起こしてもターンが進行中のまま20秒続く——その間に撮れば「作業中」と実行中の手順が出る。
    scene: "current-work-running",
    label: "帯の「いまの作業」（実行中）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "click", selector: WORK_TOGGLE_SELECTOR }],
    skipReveal: false,
    settle: { kind: "scene-event", eventKind: "tool-started", occurrence: 1 },
  },
  {
    name: "current-work-failed",
    // 自分の `request` を持つ場面（`current-work-running` と同じ理由）。`report` 場面には
    // 失敗した手順があっても `request` が無いので「依頼の手順」に一度も現れない
    // （`currentTurnSteps` は最後の `request` より前の手順を
    // 落とす）。ターンが終わったあとでも「前の依頼での手順」に失敗した1件（`isError: true` の
    // Bash）が残る。
    scene: "current-work-failed",
    label: "帯の「いまの作業」（失敗した手順）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "click", selector: WORK_TOGGLE_SELECTOR }],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "current-work-background",
    scene: "background-task",
    label: "帯の「いまの作業」（バックグラウンドタスク）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "click", selector: WORK_TOGGLE_SELECTOR }],
    skipReveal: false,
    settle: { kind: "scene-event", eventKind: "turn-finished", occurrence: 1 },
  },
  {
    name: "work-plan-running",
    // 段の2つ目で長い Bash が約7秒走るあいだに、札の段と一覧の頭のワークプランを撮る。
    scene: "work-plan",
    label: "いまの作業のワークプラン（作業中）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [{ kind: "click", selector: WORK_TOGGLE_SELECTOR }],
    skipReveal: false,
    settle: { kind: "scene-event", eventKind: "tool-started", occurrence: 4 },
  },
  {
    name: "work-plan-delegated-trail",
    // 範囲の後ろの段が今の場面で、一覧の頭のワークプランが前・本・後の群ごとの行になるのを撮る。
    // 「いまの作業」の札は会話の画面には出ないので、キャラの画面へ移ってから押す。
    scene: "delegated-range-trail",
    label: "いまの作業のワークプラン（前・本・後の群）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [
      { kind: "hash", hash: "#character" },
      { kind: "click", selector: WORK_TOGGLE_SELECTOR },
    ],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "work-plan-main-view",
    // 最終 `report` は約10秒後に届き、中間レポートの並びの最後に最終レポートが出る。
    scene: "work-plan",
    label: "ワークプランが移ったメインビュー（中間レポートと最終レポート）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: true,
    settle: {
      kind: "selector",
      selector: WORK_PLAN_FINAL_SELECTOR,
      phase: "before-prepare",
    },
  },
  {
    name: "work-plan-skipped",
    scene: "work-plan-skipped",
    label: "ワークプランで飛ばした段（帯・中間レポート）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: true,
    settle: {
      kind: "selector",
      selector: WORK_PLAN_FINAL_SELECTOR,
      phase: "before-prepare",
    },
  },
  {
    name: "delegated-range",
    scene: "delegated-range",
    label: "委譲中の帯（範囲の中の段が今）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "delegated-range-outside",
    scene: "delegated-range-outside",
    label: "委譲中の帯（範囲の外の段が今）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "delegated-range-trail",
    scene: "delegated-range-trail",
    label: "委譲中の帯（範囲の後ろの段が今）",
    homeSetup: { kind: "default" },
    workspaceSetup: { kind: "repository" },
    prepare: [],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "diary-book",
    // `diary-written` 場面の「日記帳で開く」で見開きを開く。中身（本文・しおり）は
    // `homeSetup` が件専用のホームへ書く架空の日記から来る。
    scene: "diary-written",
    label: "日記帳の見開き",
    homeSetup: { kind: "diary", date: DIARY_FIXTURE_DATE, body: DIARY_FIXTURE_BODY },
    workspaceSetup: { kind: "repository" },
    prepare: [
      { kind: "hash", hash: "#achievement" },
      { kind: "click", selector: DIARY_NOTICE_OPEN_SELECTOR },
    ],
    skipReveal: false,
    settle: { kind: "selector", selector: DIARY_BODY_SELECTOR, phase: "after-prepare" },
  },
  {
    name: "portrait-clear-confirm",
    // 消せるパックが要るので `homeSetup` が件専用のホームへ同梱の `chou` のコピーを置く。
    scene: "report",
    label: "表情を消す前の確かめ",
    homeSetup: { kind: "character", pack: SAMPLE_CHARACTER_PACK_NAME },
    workspaceSetup: { kind: "repository" },
    prepare: [
      { kind: "hash", hash: `#character?pack=${SAMPLE_CHARACTER_PACK_NAME}` },
      { kind: "click", selector: PORTRAIT_CLEAR_BUTTON_SELECTOR },
    ],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
  {
    name: "character-delete-confirm",
    scene: "report",
    label: "キャラクターを消す前の確かめ",
    homeSetup: { kind: "character", pack: SAMPLE_CHARACTER_PACK_NAME },
    workspaceSetup: { kind: "repository" },
    prepare: [
      { kind: "hash", hash: `#character?pack=${SAMPLE_CHARACTER_PACK_NAME}` },
      { kind: "click", selector: CHARACTER_DELETE_BAND_BUTTON_SELECTOR },
    ],
    skipReveal: false,
    settle: SCENE_END_SETTLE,
  },
]

/**
 * 撮る窓の大きさ。広いほうは1枚だけ撮る道具の既定と同じで、狭いほうは切り替えの規則
 * （各機能の `*.module.css` の `max-width: 760px`）の内側に入る幅にしてある。
 *
 * 狭いほうだけページ全体を撮る。縦に積み替わるので、窓に収まる範囲だけでは下の領域
 * （吹き出しと答え待ちの箱）が1枚に入らない。
 */
export const SIZES = [
  { name: "wide", width: 1400, height: 900, fullPage: false },
  { name: "narrow", width: 720, height: 900, fullPage: true },
] as const

export type CatalogSize = (typeof SIZES)[number]

/** 狭い窓は選択肢が角丸のボタンの縦並びで、選んだ選択肢の preview の面が出ないので、広い窓だけで撮る件。 */
const WIDE_ONLY_NAMES: ReadonlySet<string> = new Set([
  "question-preview-image",
  "question-preview-image-missing",
])

export function sizesOf(entry: CatalogEntry): readonly CatalogSize[] {
  return WIDE_ONLY_NAMES.has(entry.name) ? SIZES.filter((size) => size.name === "wide") : SIZES
}
