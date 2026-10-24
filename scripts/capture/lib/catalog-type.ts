// 状態のカタログの1件の型。概念ごとに割った場面のファイルと、それを組み立てるファイルが共有する。

import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
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

export const SCENE_END_SETTLE = { kind: "scene-end" } satisfies Settle

/**
 * カタログの1件。`scene` は疑似セッション（fixture/fake-session/）の場面の名前で、`name` は
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
