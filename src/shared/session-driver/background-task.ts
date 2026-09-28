// 背景のタスクの語彙。
// ターンが終わったあとも claude が動かし続けているもの（`run_in_background` の Bash・背景のサブエージェントなど）で、帯の「いまの作業」がターンの外でも「背景で動いている」と言うために持つ。

/**
 * 背景のタスクの種類。SDK の `task_type` を3つに畳む（`local_bash` → `shell`、`local_agent` → `agent`、それ以外 → `other`）。
 * 種類は本体の更新で増えるので、知らない値は落とさず `other` に倒す。
 */
export type BackgroundTaskKind = "shell" | "agent" | "other"

/**
 * 背景のタスク1件。
 * `description` は claude がツールに添えた短い説明（Bash の `description`・サブエージェントの `description`）で、会話の内容に当たるので、画面に出すだけでログにもファイルにも書かない。
 */
export type BackgroundTask = {
  readonly taskId: string
  readonly kind: BackgroundTaskKind
  readonly description: string
}
