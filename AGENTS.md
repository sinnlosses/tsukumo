# AGENTS.md

**このファイルには、毎回の手の動き（コードを書く・テストを走らせる・コミットする）に付いてくる
規則だけを1行ずつ置く。** 理由・例外・手順は正典にあり、末尾の「索引」から引く。
機械が検査している規則（lint・`test/architecture/`・hook）は索引にだけ載せる。

## 対話言語

ユーザーとの対話は常に日本語で行う。

## プロジェクト概要

**tsukumo** は、**キャラクターと一緒に楽しく仕事をするためのターミナル環境**（名前は付喪神から）。
立ち絵・吹き出し・画面レイアウトはすべてこの目的の手段で、**機能を足す前に
`docs/requirements.md`「1. 概要・目的」と「2.2 対象外とすること」を見る**。対象ユーザーは作者本人のみ。

tsukumo は Agent SDK（`@anthropic-ai/claude-agent-sdk`）で Claude Code を子プロセスとして動かし、
表示はすべて HTML（Orca 内のブラウザタブの1枚のページ。入力欄も含む）。セリフは MCP ツール
`speak`、ターンの本文は `report` で受け取る。**ホスト（Orca のタブ）と中身（Web アプリ）は分ける。**

**IMPORTANT**: Claude Code の TUI に描画を混ぜる方式（パイプ・hook の stdout・Claude Code へのパッチ）は
技術的に不可能なので、**TUI を使わず SDK で動かす側に回っている。** 設計を変えようとする前に
`docs/requirements.md`「3. 技術制約」と `docs/architecture/adr/0008-sdk-instead-of-tui.md` を
必ず読む。

## セットアップ / 環境構築

- mise で Node 26・pnpm 12 を入れる（`mise.toml` がバージョンを固定。TS は node でそのまま
  実行し、pnpm はパッケージ管理とグローバルへの導入に使う）。**新しく入れる `pnpm install` は
  `prepare` で `pnpm run build` まで済ませる**が、依存が変わらないと飛ばすので、`src/browser/` を直したあとは
  `pnpm run build` を打つ（`dist/browser/` は `.gitignore`。無いと起動が前提不足で止まる）
- `tsukumo` コマンドは `mise run setup`（`pnpm add --global "link:<リポジトリ>"`）で入っている（`docs/requirements.md` 4.6）
- ホストに依存する操作は1つの抽象の裏に置く（`docs/architecture/adr/0015-single-host-port.md`）。
  **`orca`・`bd`・`dolt`・`gh`・`python3`・`taskpolicy`・`rtk` 以外の外部コマンド依存を増やすときはユーザーの承認を得る**
- 環境の実測値は `docs/requirements.md`「5. 実行環境・非機能要件」。時間が経つと変わるので、
  前提にする前にその場で確かめる

## よく使うコマンド

全体の一覧は `README.md`「開発」。ここには手が間違えやすいものだけを置く。

```bash
pnpm run check                 # typecheck + lint + format:check + token-limit + test + test:e2e（変更後は必ずこれを通す。
                              #   単体と E2E は変えたファイルから選んだものだけ（単体は import で辿れる関連のテスト＋規約のテスト）。
                              #   --full で6段とも単体・E2E 全件。全件は main へ送る直前に打つ。
                              #   文書だけの変更は --full でも format:check・token-limit と文書の検査だけ。
                              #   同じ木で打ち直すと前回通った段を1回だけ飛ばし、E2E は落ちたファイルだけ）
pnpm run format                # 整形（oxfmt。prettier は入っていない）
pnpm run test                  # 単体テスト（Vitest）。ファイルを渡すと規約のテストも一緒に走る
pnpm run build                 # src/browser/ を直したら打つ（起動時には組み立てない）
pnpm run css-types             # *.module.css に class を足したら打つ（tsc を直に打つ前。check と build は自分で打つ）
pnpm run test:e2e:update       # DOM の構造・shared の手続き応答の型・配信するセッションイベントの種類や数を変えたら、pnpm run check より先に打つ
                              #   check の E2E は --bail=3 で、落ちを3本までしか出さないため、打ち直しを繰り返す
                              #   打ったあと git diff test/e2e/expected/ で意図した変化だけかを読んでから、
                              #   直した変更と同じコミットに入れる
node scripts/runtime/stop.ts   # 動いている tsukumo の一覧（--port <n> でそれ1つだけ止める）
```

## アーキテクチャ概要

**3層・共有層・置き場所・実装の全体図・設計判断は `docs/architecture.md` が正典。**
原則の見出しだけを置く。

- **原則1**: **Claude Code の TUI を使わない**（上の IMPORTANT）
- **原則2**: `shared` / `server` / `browser` の3層。サーバは機能ごとに
  `src/server/<機能>/{core,adapter}/` で、**`core → adapter` は禁止**（`docs/architecture.md`
  「サーバの機能と、機能どうしの辺」。許した辺以外は `test/architecture/` が落とす）
- **原則3**: ホスト・外部コマンド・OS に触るものは **`adapter/` の1ファイルに閉じ込める**。
  Agent SDK だけは機能の `adapter/` の `sdk-` で始まるファイル群に閉じ込める
- **原則4**: **キャラクターの中身をコードに書かない**（素材と表情の対応は定義ファイル側）
- **原則5**: 「**ファイル名が概念になっているか**」で分ける。`helpers.ts` / `utils.ts` /
  `common.ts` のような置き場所を名前にしたファイルは作らない。**ファイルは単数形**
  （置き場所のディレクトリの名前と、`src/browser/` の置き場所の基準は `docs/architecture.md`「全体構成」）

## テスト方針

配置・モック・消す/足すの判断は `docs/coding-standards.md`「テスト」節。TDD 推奨（`/tdd`）。
**E2E は利用者に見える流れを1本ずつと、実ブラウザでしか確かめられないもの（寸法・入力・サーバとの往復）だけ。
出し分けと DOM の細部は部品・フックの単体で、見た目（色・崩れ）は目視で確かめる**（2本目を置く条件は
`docs/architecture/testing.md`「テスト」、E2E は `docs/architecture/testing.md`「E2E の走らせ方」、目視は
`docs/architecture/testing.md`「手で確かめること」）。

**IMPORTANT**: 変更後は必ず `pnpm run check` を通してから完了を報告する。テスト件数などの根拠なしに
「完了しました」と言わない。**描画に関わる変更は、加えて何をどう確かめたか**（何が見えたか）を添える。

## コーディング規約・レビュー方針

**コードの書き方の規則は `.claude/rules/` が正典**（`typescript.md`・`comments.md`・`react.md`。
触るファイルに合うものが自動で届く）。理由・例外は `docs/coding-standards.md`（通読せず、冒頭の
「節の索引」で節を1つ特定して読む）。

**IMPORTANT**: **SDK のイベントと transcript には利用者と Claude の生の会話が入っている。**
外部に送らない・複製しない・ログに全文を出さない・テストのフィクスチャに実物を使わない
（`docs/coding-standards.md`「会話内容の扱い」）。この規約は他のどの規約よりも優先する。

- 作業ツリーのファイルは Edit / Write で書く。Bash の `sed -i`・`perl -i`・リダイレクト・`tee`・Python / node のコードでの書き込みは hook が拒む（`docs/workflow.md`）
  レビュー観点は `/code-review` の Standards 軸（`.claude/rules/`＋`docs/coding-standards.md`＋
  `docs/architecture.md`）と Spec 軸（`docs/requirements.md`）。

## Git運用

作業ツリーを分けるのは orca で、tsukumo は起こしたディレクトリでそのまま動く。

- **自分でブランチを切らない。** コミットはいま居るブランチへ積む。自分の作業ツリーの中は
  `git restore <file>` で戻してよい
- **`git add -A` を使わず、触ったファイルを個別に足す**（`node_modules` などの symlink が入る）
- **検証が済んだら、聞かずにコミットして `main` まで送る**（未コミットのまま待つと別のセッションに
  消される）。タスクは `tw ship`、タスクに紐付かない作業は `node scripts/dev/ship.ts`
  （`pnpm run ship`。手順は `docs/workflow.md`「タスクに紐付かない作業を main へ送る」）
- `main` へ送る以外で他の作業ツリーへ `reset` / `branch -d` を走らせない。push は頼まれたときだけ

## タスク運用

機械が読む設定（検証コマンド・整形コマンド・ブランチ・タスクの置き場・トラッカー）は
`.tw/config.toml`。ブランチは切らず、**枝の寿命は作業ツリーの寿命と同じ**で、1本の枝がいくつでも
タスクを持つ。

状態はチャットではなく Beads（`tw show GH-<n>` で読み、`tw edit` で直す。`.beads` は本体の作業ツリーの根で git の外。エージェントのドラフトも `draft` の課題としてここに置く）に残す。手順は
`~/.claude/skills/task-model/WORKFLOW.md` が正典で、このリポジトリの上乗せは
`docs/workflow.md`。**委譲先のモデルは `difficulty` と上の正典「分業」で決め**、判断が
想定より要ると分かったら押し切らず `difficulty` を上げて再開する。完了は検証できる証拠で判定する。
新しい作業ツリーの立ち上げ（`pnpm install`。組み立てまで `prepare` が済ませる）は人がやる。

**IMPORTANT**: 次は必ず人間の承認を得てから行う — 外部への公開・送信（`tw` が行う GitHub の
`sinnlosses/tsukumo` の Issue・label と Project 1 への書き込みは除く）、破壊的な git 操作、
認証情報や権限の変更、**`~/.claude/settings.json` などグローバル設定の書き換え**、
**グローバルなツールの導入**。`~/.claude/settings.json` の hooks と statusLine は orca が専有して
いるので、**足すときは既存エントリを壊さず追記する。**

## ドキュメントを編集するときの罠

**`docs/` の各ファイルは冒頭の「節の索引」の表に見出し名がそのまま入っている**ので、見出し名で
探すと索引の行に先に当たる。位置は行頭から特定し（`\n### 4.7 `）、編集の前後で
`grep -c '^#\{2,3\} ' <ファイル>` の数が合うかを見る。節を削る・移す・改名するときは、引かれている
句が消えていないかを `node scripts/document/find-stray-reference.ts` で見る（`pnpm run check` でも落ちる）。

## 索引

| こういうとき                                                                                    | 読むもの                                                                      |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 要件・やらないこと・技術制約・未決事項を知りたい                                                | `docs/requirements.md`                                                        |
| 3層・共有層・部品・置き場所を決める                                                             | `docs/architecture.md`（置き場所は「全体構成」）                              |
| 色・書体・レイアウト                                                                            | `docs/architecture/screen-design.md`                                          |
| セリフとレポートの分離・レポートの記法・各表示物の仕様                                          | `docs/architecture/display.md`                                                |
| ワークフローの契約（`work_plan`・`report` の口、Beads の欄）・独自のワークフローを当てる        | `docs/architecture/workflow-contract.md`                                      |
| 雑談モード                                                                                      | `docs/architecture/chat-mode.md`                                              |
| なぜ今の形なのか                                                                                | `docs/architecture.md`「設計判断」（各判断の本文は `docs/architecture/adr/`） |
| ブラウザ側の状態・Markdown・立ち絵の動き・CSS・`components/ui/` の部品の作法                    | `docs/architecture/browser.md`                                                |
| キャラクターパックの形・探索順・画面から書くときの境界                                          | `docs/architecture/character-pack.md`                                         |
| テストの方法・E2E・目視の手順                                                                   | `docs/architecture/testing.md`                                                |
| 組み立て・開発サーバ・足す依存                                                                  | `docs/architecture/build.md`                                                  |
| 規約の理由と例外（`Date` を使わない・層の辺など lint とテストが守るものも）                     | `docs/coding-standards.md`                                                    |
| 用語と識別子                                                                                    | `docs/glossary.md`                                                            |
| タスクを書く・受け入れる・作業ツリーを並行させる・tsukumo を起こす                              | `docs/workflow.md`                                                            |
| コマンドの全体・環境変数・構成                                                                  | `README.md`                                                                   |
| スキル（`~/.claude/skills/`。共通なのでこのリポジトリの事情はここと `docs/workflow.md` が補う） | 毎セッションのスキル案内                                                      |
| 過去の判断の経緯（通読しない。`grep` で節を当てる）                                             | `docs/history/tasks.md` / `docs/history/progress.md`                          |
