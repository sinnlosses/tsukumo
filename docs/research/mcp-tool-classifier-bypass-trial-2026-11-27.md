# 自前の MCP ツールと分類器・Workflow 内の拒否の実機の確認（2026-11-27）

ステータス: 調査（実機で確かめた結果の記録）。
責務: auto mode で、自前の MCP ツールを分類器に掛けずに済ませる手と、Workflow の中のエージェントの拒否の見分け方・後始末の契機を、Agent SDK の試作で確かめた結果を持つ。
読む時: tsukumo の MCP ツールを `allowedTools` へ載せる設計と、終わったエージェント・Workflow の中の拒否のお願いを下げる設計を決めるとき。
直す時: SDK を上げて挙動が変わったとき、下の「未確認」を確かめたとき。

使い捨ての試作（`/tmp` の下の node スクリプト）は確かめたあとに残していない。会話の実物は写さず、欄の有無と型と架空の値だけを書く。環境は Agent SDK 0.3.332、`permissionMode: "auto"`、`settingSources: []`、`cwd` は `/tmp` の下の空のディレクトリ、`createSdkMcpServer` の架空のサーバ `fakesrv` に架空のツール `ping`（引数 `word`）を1つ。

## 拒ませ方

`settingSources: []` の試作では、`allowedTools` に載せない MCP ツールを素直に呼ばせると分類器は拒まず、そのまま実行された（実行された引数は架空の `alpha`）。拒否を起こすには、前回の確認（`docs/research/auto-mode-denial-routing-trial-2026-11-26.md`）と同じく、PreToolUse フックが `updatedInput` だけ（`permissionDecision` なし）を返して入力を書き換える。このとき拒否は `decision_reason_type: "classifier"`・理由 `"Classifier unavailable"` で起き、書き換えた入力は実行されない。以下の「拒否」はすべてこの手で起こしたもの。

## (a) `allowedTools` は分類器を飛ばすか

架空の MCP ツールを、書き換えるフックを掛けたまま、`allowedTools` の載せ方を変えて呼ばせた。

| 載せ方                                     | 呼び手       | 拒否（`permission_denied`・`PermissionDenied` フック） | 実行まで進んだか                           |
| ------------------------------------------ | ------------ | ------------------------------------------------------ | ------------------------------------------ |
| 載せない                                   | 主           | 出た（各1回）                                          | 進まなかった                               |
| 載せない                                   | `Agent` の子 | 出た（`agent_id` あり）                                | 進まなかった                               |
| 完全な名前（`mcp__fakesrv__ping`）         | 主           | 出ない                                                 | 進んだ（書き換え後の入力 `alphax` で実行） |
| 完全な名前（`mcp__fakesrv__ping`）         | `Agent` の子 | 出ない                                                 | 進んだ（`betax`）                          |
| サーバ単位（`mcp__fakesrv`）               | 主           | 出ない                                                 | 進んだ（`alphax`）                         |
| サーバ単位（`mcp__fakesrv`）               | `Agent` の子 | 出ない                                                 | 進んだ（`betax`）                          |
| PreToolUse が `allow` と書き換えを両方返す | 主           | 出ない                                                 | 進んだ（`alphax`）                         |

読み取れること:

- `allowedTools` に載せた MCP ツールは、主でもサブエージェントでも、auto mode の分類器を通らずに許可される（入力を書き換えられても拒否にならない）。完全な名前とサーバ単位のどちらも効く
- PreToolUse フックの `allow` も同じく分類器を飛ばす。ただし、フックは全呼び出しで走るので、載せ方としては `allowedTools` のほうが単純
- 試せなかった: PreToolUse の `allow` をサブエージェントの中で。Workflow の中のエージェントの `allowedTools`（サブエージェント側）は `Agent` の子と同じ載せ方が効くかを、Workflow では確かめていない（下の (b) は載せない条件のみ）

## (b) Workflow の中のエージェントの拒否と終了の突き合わせ

子の claude に Workflow ツールを使わせ、その中の1エージェントに架空の MCP ツールを呼ばせた（`allowedTools` なし・書き換えるフック付き）。

| 確かめたこと                                                  | 結果                                                                                                                                                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permission_denied` の `system` メッセージの `agent_id`       | 入る（架空の値 `a40c5f4bc24ca40ce` の形の ID 文字列）                                                                                                                                                                           |
| `PermissionDenied` フックの `agent_id`・`agent_type`          | `agent_id` は上と同じ値。`agent_type` は `"workflow-subagent"`。ほかの欄は `session_id`・`transcript_path`・`cwd`・`prompt_id`・`permission_mode`・`effort`・`tool_name`・`tool_input`・`tool_use_id`・`reason`・`mcp_server`   |
| `SubagentStart` の欄                                          | `session_id`・`transcript_path`・`cwd`・`prompt_id`・`agent_id`・`agent_type`（`"workflow-subagent"`）・`hook_event_name`                                                                                                       |
| `SubagentStop` の `agent_id` は拒否の `agent_id` と一致するか | **一致した**（`SubagentStart` とも同じ）。`agent_type` は `"workflow-subagent"`。欄は上の共通欄に `stop_hook_active`・`agent_transcript_path`・`last_assistant_message`・`background_tasks`・`session_crons`                    |
| 主の `query` の `result` が届く時機                           | Workflow の起動直後（エージェントの作業中）に最初の `result`（`subtype: "success"`）が届き、拒否・`SubagentStop` はその後に来る。末尾にも `result` が届く。最初の `result` の `permission_denials` は空                         |
| 見分け                                                        | `Agent` ツールで起こした子は `agent_type` が `"general-purpose"`（指定したエージェントの種類）、Workflow の中は `"workflow-subagent"`。入力の欄の形（`agent_id`・`agent_type` の有無）は同じで、`agent_type` の値で見分けられる |

`Agent` ツールの子では、同じ試作で `SubagentStop` のログが取れなかった（`SubagentStart` と拒否は取れたが、`SubagentHandback` のあとに `result` が届き、`SubagentStop` の行は無かった）。主のセッションですでに使っている `SubagentStop` の経路は別に確かめる。

Workflow の中のエージェントについての追加の観察: Workflow の進み具合は `system` の `task_started`・`task_progress`・`task_notification`（`workflow_name`・`workflow_progress`・`run_id`・`tool_use_id` など）で流れ、`agent_id` は持たない。エージェント単位の終わりは `SubagentStop` で拾う。

## (c) 拒否のあとの同じ入力の打ち直し

Workflow の中のエージェントは、拒否のあと、**自分から同じ入力で打ち直した**（`PreToolUse` の入力は2回とも `word: "gamma"`、拒否の `tool_input` は書き換え後の `gammax`）。1回目の拒否 → 2回目の拒否のあとにエージェントが終わった（`SubagentStop`）。`Agent` ツールの子も同じ入力で2回打った（`beta`）。したがって、一度だけの許可の印が当たる余地はある。ただし、エージェントが終わったあとに利用者が許可しても、打ち直す相手がいない。

## 案A に使う形

- tsukumo の MCP ツールを分類器に掛けない手は、`query()` の `allowedTools` にサーバ単位（`mcp__<サーバ名>`）で載せるのが最小の手。完全な名前でも同じ効きで、ツールを足すたびに表を直す要らなさでサーバ単位が楽。主・サブエージェントの両方で分類器の拒否が出なくなることを確かめた
- 載せたあとは、tsukumo のツールの拒否のお願いは出なくなる。拒むべきものを `allowedTools` から外す手は別に要る（tsukumo のツールには該当が無い想定。要確認）
- PreToolUse の `allow` は代替になるが、全ツールの呼び出しでフックが走る分、`allowedTools` のほうが小さい

## 終わったエージェントのお願いを下げる契機と、Workflow の中の拒否の見分け方

- 契機: `SubagentStop` フックの `agent_id` と、お願いが持つ `agent_id`（`permission_denied` の `system` メッセージ・`PermissionDenied` フックの `agent_id`）の一致。Workflow の中のエージェントでも一致を確かめた。お願いが持つ `agent_id` が一致する `SubagentStop` が来たら、そのお願いを下げられる（打ち直す相手がいないため）
- 見分け: `agent_type` が `"workflow-subagent"` なら Workflow の中。値が `"general-purpose"` などなら `Agent` ツールの子。`agent_id` が無ければ主
- Workflow の中のエージェントには、メインから声を届ける口が無い。拒否のお願いを出して利用者が許可しても、エージェントが終わっていれば届かないので、出す前に `agent_type` で判定し、`workflow-subagent` のお願いは出さずに拒否のまま通す（または、エージェントの終了までに利用者が答えられるときだけ出す）という分け方が取れる
- `Agent` ツールの子の終了は、この試作では `SubagentStop` で拾えなかった。主の経路で使っている `SubagentStop`（`sdk-lap-hook.ts`・`sdk-implementer-stop-hook.ts`）との差を調べてから、契機にする

## 後段の本文に効くこと

- tsukumo の MCP ツールを分類器に掛けない課題: 手は `allowedTools` のサーバ単位（または完全な名前）で成り立つ。「`allowedTools` で効くかは確かめていない」という前提は外せる
- Workflow の中の拒否にお願いを出し続けない課題: 契機は `SubagentStop` の `agent_id` の一致で成り立つ。見分けは `agent_type: "workflow-subagent"`。`Agent` ツールの子の終了の拾い方は未確認なので、その範囲を本文に残す

## 未確認

- `Agent` ツールの子の `SubagentStop` が届く条件（この試作では届かなかった。`maxTurns`・`result` の時機の影響かも未確認）
- Workflow の中のエージェントの呼び出しを、`allowedTools` が分類器から外すか（Workflow のエージェントは `allowedTools` を引き継ぐかの確認）
- PreToolUse の `allow` をサブエージェント・Workflow の中で
- 分類器が実際に「危険」と判断して拒む条件での、`allowedTools` の効き目（`allowedTools` は分類器を飛ばすので、危険な呼び出しも通る点は設計側で見る）
