# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `docs/workflow.md`）

## 2026-09-09 サイドバーの候補と、その性格

サブエージェントの状況表示をサイドバーの候補にしてもよい。

**ただし biim システム的にはサイドバーは補足情報などを表示するもので、サブエージェントの
状況だけを表示するものではないのは注意。**

### 補足（メインセッションの読み）

きっかけは、ユーザーが「サブエージェントの状況を UI で見たい」と言ったこと。Claude Code には
`/tasks` があるが、**知りたいときにコマンドを打つ必要がある＝そのたびに手が止まる**。
サイドバーに常時出ていれば打つ必要がない。これは tsukumo の目的（仕事が捗る）に直接効く。

**実現可能性は確認済み**: サブエージェントの transcript は
`~/.claude/projects/<slug>/<session-id>/subagents/agent-<id>.jsonl` に、本体と同じ JSONL 形式で
書かれている。`src/transcript.ts` が読める形。

**罠**: `docs/requirements.md` 4.1 に書いたとおり、`*.jsonl` を再帰的に拾うと
**サブエージェントの発話が本体の吹き出しに混ざる**。サイドバー用として意図的に別扱いにすること。

**Orca 側からは見えない**（実測）。`orca orchestration worker-list` は空を返す。Orca が管理するのは
`orca orchestration worker-start` で起動したワーカーだけで、Claude Code のサブエージェントは
Claude Code の管理下にあり、Orca は存在を知らない。
