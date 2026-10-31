# 台本の agent への hook の掛かりと台本の読み込みの実機の確認（2026-11-01）

ステータス: 調査（実機で確かめた結果の記録）。
責務: `docs/research/agent-harness-adoption-2026-11-01.md`（以下「調査メモ」）6章の項目1・3と、台本の入口3つを、Claude Code の dynamic workflows で実際に走らせて確かめた結果を持つ。
読む時: 移行の設計（ADR）を書くとき、関門と計測を台本の中に置くか外へ出すかを決めるとき。
直す時: 確かめられなかった項目（下の「未確認」）を確かめたとき。

使い捨ての台本とスキルは確かめたあとに消した。残したのはこの記録だけで、会話の実物は写していない。

## 結果

| 確かめたこと                                                                          | 打った手                                                                                                       | 結果                                                                                                                                                                                                                                                                                    | 調査メモの何に当たるか                        |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 台本の agent の `git commit --dry-run` が `tw commit-guard` に拒まれるか              | 着手の印が立った作業ツリーで台本を走らせ、agent に `git commit --dry-run -m probe` を打たせた                  | **拒まれた**。`PreToolUse:Bash` の hook の文面（着手の印が立っている作業ツリーでは `git commit` を拒む）がそのまま返った。台帳には、この agent の `agent` の記録も1行足された                                                                                                           | 6章の項目1（PreToolUse）                      |
| 台本の agent の起動で `tw lap-hook`（`SubagentStart`）が `delegate` の start を書くか | 開いた `delegate` を `tw lap` で閉じてから、`agentType: 'tsukumo-workflow:no-delegate'` の agent を1体走らせた | **書いた**。手で打っていない `delegate` の start が台帳に1行足された                                                                                                                                                                                                                    | 6章の項目1（SubagentStart）                   |
| 保存済みワークフローを名前で呼べるか                                                  | `.claude/workflows/probe.js`（未追跡）を作り、`Workflow` を `name: "probe"` で呼んだ                           | **呼べなかった**。エラーは「見つからない。使えるのは deep-research だけ」。同じファイルを `scriptPath` で渡すと走った                                                                                                                                                                   | 6章の項目3                                    |
| `isolation: 'worktree'` の分岐元                                                      | agent に `git rev-parse --abbrev-ref HEAD` と `git log -1 --format=%h` を打たせた                              | 分岐元は**現在の枝の先頭ではなく `origin/main`**。作業ツリーの枝と主ブランチはどちらも `da885b6fb` で、agent が見たのは `origin/main` の `45a53ff0b`（主ブランチの祖先）。未送信のコミットは agent の作業ツリーに入らない。枝は `worktree-<run>-<n>` で、走ったあとに作業ツリーは消えた | 6章の項目3                                    |
| 委譲先（`tsukumo-workflow:no-delegate`）から `Workflow` を呼べるか                    | `Agent` ツールで起こし、`ToolSearch` で `Workflow` を探させた                                                  | **呼べない**。拒否ではなく、道具が見つからなかった                                                                                                                                                                                                                                      | 2.1（委譲先は `Workflow` を持たない）の裏取り |
| プランで有効か・規模の目安                                                            | メインから `Workflow` を実際に呼んだ                                                                           | 有効（呼べた）。切り替えの名前は文書では `/config` の Dynamic workflows の行と `disableWorkflows`（`enableWorkflows` という設定は文書にない）。規模の目安は、文書が既定 `medium`（Pro は `small`）と書き、このセッションの `Workflow` の説明は `medium`                                 | 6章末尾                                       |

## 設計に効くこと

- 関門は台本の agent にも掛かる。ただし `lap-hook` は `agent_type` の末尾が `no-delegate`・`general-purpose` のときだけ `delegate` を書くので、台本の `agent()` が既定の型のままだと計測が書かれない。台本で `agentType` を指す必要がある。
- `isolation: 'worktree'` は未送信のコミットを持たない。送り出し前の枝の上で並列に直させる設計には使えず、`main`（`origin/main`）に載った内容を前提にする。
- 台本はこのセッションの途中で足した保存済みのファイルを読まなかった。`/reload-skills` か次のセッションで読まれるかは未確認。
- 計測の確かめには `tw metrics --stages` が使えない（送り出したタスクだけを数える）。`.git/task-workflow/flow/` の台帳を直接読んだ。

## 未確認

- 保存済みワークフローが次のセッション（または `/reload-skills` のあと）に `name` で呼べるか。確かめ方: `.claude/workflows/` に `meta` つきの台本を置き、新しいセッションで `Workflow` を名前で呼ぶ。
- スキル本文に「`Workflow` を名前で呼ぶ」1行を持たせた形が通るか。確かめ方: 同上のスキルを新しいセッションで `Skill` から呼ぶ（このセッションで足したスキルは未読込のため呼べなかった）。メインの会話からの `Workflow` 呼び出しは、このタスクの指示があるときに拒まれなかった。
- `SubagentStop` の `handback-guard` が台本の agent に掛かるか。
- 台本の agent から `phase_result`・`speak` を呼べるか（後続の試作の範囲）。
