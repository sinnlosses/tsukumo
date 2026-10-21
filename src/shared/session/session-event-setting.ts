// セッションの出来事（`SessionEvent`）のうち、モデル・effort・許可モードの設定に関するものの型。

import type { EffortLevel, PermissionMode } from "../command.ts"

/**
 * SDK のモデル一覧（`supportedModels()`）1件のうち、effort に関わる部分だけを写したもの。
 * 「いま効いている値」ではなく「対応の有無・選べる段」だけ。
 * `model` は SDK の `ModelInfo.value`（`opus` のような別名や明示のモデル ID）。
 * `resolvedModel` は `model` が指す正規のモデル ID で、SDK が返さないときは `model` と同じ。
 * 名前の照合はこの `resolvedModel` を通して完全一致で行う。
 */
export type ModelEffortSupport = {
  readonly model: string
  readonly resolvedModel: string
  readonly supportsEffort: boolean
  readonly effortLevels: readonly EffortLevel[]
}

/** `setting-confirmed` が運ぶ、どの設定をどの値で見届けたか。 */
export type SettingConfirmation =
  | { readonly setting: "model"; readonly value: string }
  | { readonly setting: "effort"; readonly value: EffortLevel }
  | { readonly setting: "permissionMode"; readonly value: PermissionMode }

export type SettingEvent =
  /**
   * モデルが変わったことを、`session-info`（`init`）を待たずに先回りで伝える。出どころは2つ:
   *
   * 1. `/model` のローカルコマンドが実行された合図（`assistant` に乗る `local_command_run: { command: "model", args }`。実測）。`init` は1ターン遅れる
   * 2. `session.setModel` を駆動が確定させたとき。
   *    駆動が実際に切り替えたことを確認してから出すので、ブラウザ側のローカル echo ではない（駆動を経ずにこのイベントを合成しない）
   *
   * `model` はそのまま状態へ運ぶ値。
   * 1 のときは `/model` に渡した引数（前後の空白だけ除いてある）で、エイリアスとして知っているかどうかの検証はしていない。2 のときは `MODEL_ALIASES` の値そのもの。
   * `MODEL_ALIASES` と完全一致するときだけ状態を更新する判断は畳み込み側が持つ（知らない値では状態を変えず、次の `init` を待つだけにする）。
   */
  | { readonly kind: "model-changed"; readonly model: string }
  /**
   * 起動直後に分かった、モデルごとの effort の対応（{@link ModelEffortSupport}）。駆動が起動直後に1回だけ取りに行く（`supportedModels()`）。
   * 取れなかったとき（呼び出しが落ちた・空だった）は流れない。
   */
  | { readonly kind: "model-effort-support"; readonly models: readonly ModelEffortSupport[] }
  /**
   * effort の値が決まった。起こした直後（起こした値）と、切り替えを受け付けたとき（`session.applyFlagSettings` が通ったとき）に届く。
   * 「効いたのを見届けた」合図ではなく、そちらは {@link SettingConfirmation} を運ぶ `setting-confirmed`。
   */
  | { readonly kind: "effort-changed"; readonly effort: EffortLevel }
  /** 許可モードの切り替えを受け付けた（`session.setPermissionMode` が通った）。`model-changed` / `effort-changed` と同じ受け付けの合図。 */
  | { readonly kind: "permission-mode-changed"; readonly mode: PermissionMode }
  /**
   * モデル・effort・許可モードのどれかが効いているのを、SDK から届いた値で見届けた。値は設定ごとの型に絞ってあり、受け付けた値と合うかは読む側が決める。
   * 出どころは `assistant` の `message.model`（メインのみ）・`init` の `model` / `permissionMode`・
   * フック入力（`PreToolUse` と `Stop`）の `effort.level` / `permission_mode`。
   * effort に対応しないモデルでは `effort.level` が来ないので、effort のこの合図は出ない。
   */
  | ({ readonly kind: "setting-confirmed" } & SettingConfirmation)
