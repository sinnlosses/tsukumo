# main に付けた advisor はサブエージェントにも効くか（実験の記録）

最終更新: 2026-10-10（Claude Code 2.1.296、Agent SDK 同梱の型、実測）
ステータス: **実験の観測であって正典ではない。** 設計に使うときは結論を正典へ移す。
`docs/` の他ファイルにある「節の索引」はここには作らない（`docs/research/` の慣習）。

問いは、Anthropic の advisor strategy（実行役の Sonnet・Haiku が、解けない判断に当たったときだけ
自分で Opus に相談する形）に寄せるとき、main に付けた advisor が `Agent` で起こしたサブエージェントにも
効くかどうか。効けば、実装役・調査役も各自 Opus に相談でき、「止めて main を経由して相談する」形に
戻らずに済む。

## 結論

- **効く。** main に `advisorModel` を付けるだけで、`general-purpose`・`no-delegate`・
  `model: "haiku"` を指定した `general-purpose` のサブエージェントが、それぞれ自分で advisor を呼べた
- サブエージェントごとに付ける口は見つからなかった。要らなかったので、探した範囲では無い
- advisor を呼ぶのは**問いが相談を促したとき**だった。促さない問いでは、Sonnet のサブエージェントは呼ばなかった（1回）
- Opus の使用量は、親の result の `modelUsage["claude-opus-5-5"]` に合算される

## 打ったコマンドの形

作業用の cwd は `/tmp/adv`。依頼文はすべて作り物（架空の図書貸出システムの設計の問い）で、
stdin は `< /dev/null` で閉じた。`timeout` コマンドは無い環境だった。

main だけ（見え方の確認）:

```
claude -p --output-format stream-json --verbose --settings '{"advisorModel":"opus"}' --model sonnet "<架空の設計の問い。必ず advisor に相談してから答えるよう明示>"
```

サブエージェント（`--plugin-dir` は `no-delegate` を出すために付けた）:

```
claude -p --output-format stream-json --verbose --settings '{"advisorModel":"opus"}' --model sonnet \
  --plugin-dir <リポジトリ>/vendor/tsukumo-plugins \
  "Agent ツールで subagent_type が <general-purpose | no-delegate> のサブエージェントを1つ起こし、<架空の問い。advisor に相談するよう明示>を渡してください。あなた自身は advisor を呼ばないでください。"
```

- Haiku の回は、依頼文に「model が haiku」と足した（`Agent` の入力の `model: "haiku"` になった）
- 促さない回は、サブエージェントへの問いから advisor の話を外した
- `--settings` の値は JSON 文字列で、`"opus"`（別名）で足りた。モデル ID は要らなかった。`/advisor` の対話は試していない

## 結果

| 役                          | 相談を促したか | advisor を呼んだか | 根拠                                                                                         |
| --------------------------- | -------------- | ------------------ | -------------------------------------------------------------------------------------------- |
| main（Sonnet）              | 促した         | 呼んだ             | stream-json の `assistant` に `server_tool_use`（`name: "advisor"`）と `advisor_tool_result` |
| `general-purpose`（Sonnet） | 促した         | 呼んだ             | サブエージェントの transcript に同じ2つ                                                      |
| `no-delegate`（Sonnet）     | 促した         | 呼んだ             | 同上                                                                                         |
| `general-purpose`（Haiku）  | 促した         | 呼んだ             | 同上。transcript の assistant 行の `model` は `claude-haiku-5-5`                             |
| `general-purpose`（Sonnet） | 促さなかった   | 呼ばなかった       | `"name":"advisor"` が 0 件。result の `modelUsage` に Opus が出ない                          |

各行とも1〜数回の観測。呼ばれ方のばらつきまでは見ていない。

## 見分け方

advisor を呼んだことは、次の3つで見分けられる。

- `assistant` の `message.content` に `{type: "server_tool_use", name: "advisor", input: {}}` があり、
  続けて `{type: "advisor_tool_result", content: {type: "advisor_redacted_result", ...}}` が来る。
  助言の本文は暗号化されていて読めず、`input` も空（advisor は会話全体を見て答える）
- result の `modelUsage` に `claude-opus-5-5` の項目が立つ（input・output・`costUSD`）
- main の assistant 行の `message.usage.iterations` に `{type: "advisor_message", model: "claude-opus-5-5", ...}` が入る

どこで見えるかは記録によって違う。

| 記録                                                                          | main の advisor                           | サブエージェントの advisor                                                                                         |
| ----------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| stream-json                                                                   | 呼び出し・結果とも見える                  | **呼び出しも結果も出ない**（`parent_tool_use_id` 付きの `Agent` の中の `tool_use` は見えるが、advisor は見えない） |
| 親の transcript（`~/.claude/projects/<cwd をハイフン化>/<session_id>.jsonl`） | 呼び出し・結果・`usage.iterations` が出る | `Agent` の `tool_result` の user 行に `advisor_message` が1件出る                                                  |
| サブエージェントの transcript（`<session_id>/subagents/agent-<id>.jsonl`）    |                                           | 呼び出しと結果が出る。`usage.iterations` は**入っていない**                                                        |
| result の `modelUsage`                                                        | `claude-opus-5-5` が立つ                  | 親の項目に合算される（サブエージェント単位の内訳は出ない）                                                         |

- `usage.iterations` が出るのは main の assistant 行だけ。result の `usage.iterations` には Opus 分が出ない
- 隣の `agent-<id>.meta.json` に `agentType`・`toolUseId` がある。サブエージェントの判定は、
  `subagents/` 以下で `"name":"advisor"` と `advisor_tool_result` を grep するのが確実だった
- advisor の呼び出しは、assistant の `message.model` を書き換えない（呼び出した側のモデルのまま）

## Opus の使用量の数え先

result の `modelUsage["claude-opus-5-5"]` に、main とサブエージェントの分が合算される。
1回の相談の目安は input 2万〜3万、output 約 1000 トークンだった（会話の長さで変わる）。
実験の例では、Opus の項目の `costUSD` が Sonnet の項目より大きかった。advisor を付けると、
呼ばれるたびに Opus の入力が（会話の長さぶん）かかる。

## 付けられる口の一覧と探した場所

| 口                                             | 場所                                                                                                         | 結果                                                                                                                                                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Settings.advisorModel?: string`               | `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`（「Advisor model for the server-side advisor tool」） | 使える。`--settings` の JSON にも同じキーで渡せる。親に付ければサブエージェントにも効く                                                                                                                                                          |
| `/advisor`                                     | Claude Code の対話                                                                                           | 試していない                                                                                                                                                                                                                                     |
| `AgentDefinition` のフィールド                 | `sdk.d.ts` の `AgentDefinition`                                                                              | `description`・`tools`・`disallowedTools`・`prompt`・`model`・`mcpServers`・`skills`・`initialPrompt`・`maxTurns`・`background`・`omitClaudeMd`・`memory`・`effort`・`permissionMode`・`observer`・`observerMessage`。advisor に関わる項目は無い |
| プラグインのサブエージェント定義の frontmatter | `vendor/tsukumo-plugins/agents/no-delegate.md`                                                               | `name`・`description`・`disallowedTools`・`hooks` だけ。advisor の項目は無い                                                                                                                                                                     |
| `Agent` ツールの入力                           | 実験で見えた入力（`subagent_type`・`model` など）                                                            | advisor を指す引数は見えなかった                                                                                                                                                                                                                 |

サブエージェントだけ advisor を切る口も、見つからなかった。

## 未確認のこと

- `/advisor` の対話での口の名前・値の形
- advisor を促さない問いで、サブエージェントや main が自分から呼ぶ頻度（Sonnet のサブエージェントで1回、呼ばなかっただけ）
- main を Haiku にしたときの advisor（サブエージェントを Haiku にした回だけ試した）
- `advisorModel` にモデル ID を渡したときの挙動
- サブエージェントの呼び出しごとの Opus の使用量（親の result には合算でしか出ない）
- Claude Code の公式文書の記述（この記録は実測とローカルの型だけで書いた）

## 参考

- <https://claude.com/blog/the-advisor-strategy>
- <https://makandracards.com/makandra/626779-claude-code-advisor-tool>
