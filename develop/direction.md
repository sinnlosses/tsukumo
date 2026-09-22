# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

- 複数の tsukumo を並列で動かすと、次の3つが起きて困っている。
  1. 別のセッションがいじっているファイルを避けながらコミットすることになる
  2. 別のセッションがいじっているファイルがあると待ち状態にしようとする
  3. 別のセッションが `bun` のプロセスを `pkill` して、使っている本体が落ちる
- **3 は対処済み**（PreToolUse hook で広い `kill` を拒否し、`scripts/stop.ts` を代わりに置いた）。
  **残る 1 と 2 を、セッションごとに worktree で分離する形で解く。**
- 満たすべき条件（ユーザーが提示）:
  - **ユーザーは極力意識しなくてよいこと**（`tsukumo` と打つだけで済む）
  - **ぶつかるかどうかは tsukumo が判断して適切に分離する仕組みであること**
  - **一時的に分離しても、こまめに main にマージされてコンフリクトが小さくなる運用であること**
- 決めた形（この会話で承認済み。蒸し返さない）:
  - **1セッション = 1 worktree を既定にし、tsukumo が起動時に自分で用意して、完了後に畳む。**
    切る・`node_modules` と `characters/local` の symlink・`bun run build`・マージ・破棄まで
    tsukumo がやる
  - **SDK の `cwd` を worktree に、`projectConfigRoot` を本体に向ける。** 作業だけが分離し、
    `.claude/settings.json` の hook・skills・`CLAUDE.md` は本体のものが効く（worktree 側に
    複製しない）。`cwd` は `buildQuerySeedOptions` が既に渡しているので差し替えるだけ
  - **排他の印は `.git` 配下**（`git rev-parse --git-common-dir` が全 worktree で同じパスを返す）。
    タスクid・ブランチ・pid・時刻を置き、pid の生死で落ちたセッションの印を掃除する。
    **orca のメタデータ（`worktree ps` / `--comment`）は表示にだけ使い、判断の根拠にしない**
    （orca に聞かないと判断できない形にしないため）
  - **worktree で分離するとファイル衝突の排他は不要になる**ので、`.git` の印が防ぐのは
    「同じタスクを2つのセッションが取らない」ことだけ。`tasks.json` の `doing` は
    **進捗の記録に戻し、コミットしてよい**（1タスク = 1ブランチになるので「1タスク = 1コミット」
    の制約が消える）。判断には使わない
  - **マージは1タスクごと。** 完了したら本体へマージして worktree を畳み、次は main の先端から
    切り直す（ブランチが1タスクより長生きしない）
- 段取り（この順で分解する）:
  1. **本体の作業ツリーの未コミット変更を片付ける**（移行の前提。この会話の時点で19件残っていた。
     他のセッションの作業なので、止めどきはユーザーが決める）
  2. 起動時に worktree を用意する（切る・symlink 2本・build・`cwd` と `projectConfigRoot`）
  3. 着手の印を `.git` 共有に置く（二重着手だけを防ぐ。pid で掃除）
  4. 完了時に本体へマージして worktree を畳む（衝突したら止めて画面に出す）
  5. `CLAUDE.md` の「Git運用」「タスク運用」と `docs/workflow.md` を新しい運用に書き換える
     （`CLAUDE.md` の「worktree は不要と判断している」の段落も直す。判断の前提が変わった）
- タスク本文で決める必要が残っている論点:
  - **1つ目のセッションも worktree にするか**（本体のままにすると分岐が増える。全部切るほうが単純）
  - **tsukumo 自身を直したときの反映**（worktree で直したコードは、本体で動いている tsukumo には
    効かない。`bun run dev` の見張りとの関係）
  - **マージが衝突したときの止め方**
- 実測（この会話で確かめた。前提にする前に確かめ直す必要は無い）:
  - `git worktree add` 0.14秒 / `bun run build` 0.05秒 / 切ってから `bun run check` 完走まで10.2秒
  - `node_modules` と `characters/local` は本体への symlink で足りる（bun もテストも通る）
  - 切ったばかりの worktree の `bun run check` は **1158 pass / 0 fail**。同時刻の本体は
    他セッターの作業中の変更で 15 fail ＋ typecheck エラー
  - このリポジトリは既に orca 管理の worktree として登録済み（`isMainWorktree: true`）

## エージェントのドラフト
