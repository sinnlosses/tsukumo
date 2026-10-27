## 対話言語

ユーザーとの対話は常に日本語で行う。理由・例外・手順の正典は `docs/README.md` の索引表から引く。

## プロジェクト概要

**tsukumo** は、**キャラクターと一緒に楽しく仕事をするためのターミナル環境**。
機能を足す前に `docs/requirements/purpose-and-scope.md`「1. 概要・目的」と「2.2 対象外とすること」を見る。
Agent SDK で Claude Code を子プロセスとして動かし、表示はすべて HTML。セリフは MCP ツール `speak`、ターンの本文は `report` で受け取る。

**IMPORTANT**: **TUI を使わず SDK で動かす**（TUI に描画を混ぜる方式は技術的に不可能）。
設計を変える前に `docs/requirements/constraint-and-environment.md`「3. 技術制約」と `docs/architecture/adr/0008-sdk-instead-of-tui.md` を読む。

- **キャラクターの中身をコードに書かない**（素材と表情の対応は定義ファイル側）

## よく使うコマンド

```bash
pnpm run check            # 変更後は必ず通す（着手中の作業ツリーでは tw verify）
pnpm run format           # 整形
pnpm run test             # 単体テスト。ファイルを渡すと規約のテストも走る
pnpm run build            # src/browser/ を直したら打つ
pnpm run css-types        # *.module.css に class を足したら打つ
pnpm run test:e2e:update  # DOM・手続き応答の型・セッションイベントを変えたら check より先に打つ
```

## テスト方針

配置・モックは `docs/coding-standards/test.md`「テスト」節。TDD 推奨（`/tdd`）。E2E は利用者に見える流れを1本ずつと、実ブラウザでしか確かめられないものだけ。見た目（色・崩れ）は目視で確かめる（`docs/architecture/testing.md`）。
`pnpm run check` を通し、テスト件数などの根拠を示してから完了を報告する。描画に関わる変更は、何をどう確かめたか（何が見えたか）を添える。

## コーディング規約

書き方は `.claude/rules/` が正典。理由・例外は `docs/coding-standards/` の子（目次は `docs/coding-standards.md`）。
**IMPORTANT**: SDK のイベントと transcript には利用者と Claude の生の会話が入っている。外部に送らない・複製しない・ログに全文を出さない・テストのフィクスチャに実物を使わない（`docs/coding-standards/conversation-content.md`「会話内容の扱い」）。この規約は他のどの規約よりも優先する。

## Git運用

- 作業ツリーを分けるのは orca で、tsukumo は起こしたディレクトリでそのまま動く
- 自分でブランチを切らない。コミットはいま居るブランチへ積む。`main` へ送る以外で、他の作業ツリーへ `reset` / `branch -d` を走らせない
- 検証が済んだら、聞かずにコミットして `main` まで送る（未コミットのまま待つと別のセッションに消される）。タスクは `tw ship`、タスクに紐付かない作業は `pnpm run ship`（`src/`・`scripts/`・`test/` を触る差分は受け入れ役を通す）
- push は頼まれたときだけ。新しい作業ツリーの立ち上げは人がやる

## 承認が要ること

外部への公開・送信（`tw` が行う GitHub の `sinnlosses/tsukumo` の Issue・label と Project 1 への書き込みは除く）、破壊的な git 操作、認証情報や権限の変更、`~/.claude/settings.json` などグローバル設定の書き換え、グローバルなツールの導入は、人間の承認を得てから行う。起こしてよい外部コマンドは `test/architecture/outside-world.test.ts` の `ALLOWED_COMMANDS` が正典。
`~/.claude/settings.json` の hooks と statusLine は orca が専有しているので、足すときは既存エントリを壊さず追記する。
