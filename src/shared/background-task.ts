// 背景のタスク（docs/glossary.md「背景のタスク」）の語彙。ターンが終わったあとも claude が
// 動かし続けているもの（`run_in_background` の Bash・背景のサブエージェントなど）で、帯の
// 「いまの作業」がターンの外でも「背景で動いている」と言うために持つ（docs/screen-design.md
// 13.9「背景のタスク」）。
//
// SDK の `system` / `background_tasks_changed` からの変換は core（src/server/session-driver/core/sdk-message.ts）に
// ある。ここは両側が読む形だけ。

/**
 * 背景のタスクの種類。SDK の `task_type` を3つに畳む（`local_bash` → `shell`、`local_agent` →
 * `agent`、それ以外 → `other`）。種類は本体の更新で増えるので、知らない値は落とさず `other` に
 * 倒す（docs/requirements.md 4.1「未知のイベント種別が来ても落ちない」）。
 */
export type BackgroundTaskKind = "shell" | "agent" | "other"

/**
 * 背景のタスク1件。`description` は claude がツールに添えた短い説明（Bash の `description`・
 * サブエージェントの `description`）で、会話の内容に当たる——画面に出すだけで、ログにも
 * ファイルにも書かない（docs/coding-standards.md「会話内容の扱い」）。
 */
export type BackgroundTask = {
  readonly taskId: string
  readonly kind: BackgroundTaskKind
  readonly description: string
}
