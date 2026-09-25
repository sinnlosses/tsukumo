# CLAUDE.md

**このファイルには、毎回の手の動き（コードを書く・テストを走らせる・コミットする）に付いてくる
規則だけを1行ずつ置く。** 理由・例外・手順は正典にあり、末尾の「索引」から引く。
機械が検査している規則（lint・`test/architecture.test.ts`・hook）は索引にだけ載せる。

## 対話言語

ユーザーとの対話は常に日本語で行う。

## プロジェクト概要

**tsukumo** は、**キャラクターと一緒に楽しく仕事をするためのターミナル環境**（名前は付喪神から）。
立ち絵・吹き出し・画面レイアウトはすべてこの目的の手段で、**機能を足す前に
`docs/requirements.md`「1. 概要・目的」と「2.2 対象外とすること」を見る**。対象ユーザーは作者本人のみ。

tsukumo は Agent SDK（`@anthropic-ai/claude-agent-sdk`）で Claude Code を子プロセスとして動かし、
表示はすべて HTML（Orca 内のブラウザタブの1枚のページ。入力欄も含む）。セリフは MCP ツール
`speak`、ターンの本文は `report` で受け取る。**箱（Orca のタブ）と中身（Web アプリ）は分ける。**

**IMPORTANT**: Claude Code の TUI に描画を混ぜる方式（パイプ・hook の stdout・本体へのパッチ）は
技術的に不可能なので、**TUI を使わず SDK で動かす側に回っている。** 設計を変えようとする前に
`docs/requirements.md`「3. 技術制約」と `docs/architecture.md`「Claude Code の TUI を捨て、
SDK で動かす」を必ず読む。

## セットアップ / 環境構築

- Bun 1.3 以上。`bun install` のあと **`bun run build` でブラウザ側を1回組み立てる**
  （`dist/browser/` は `.gitignore`。無いと起動が前提不足で止まる）
- `tsukumo` コマンドは `bun link` で入っている（`docs/requirements.md` 4.6）
- ホストに依存する操作は1つの抽象の裏に置く（`docs/architecture.md`「ホスト依存の操作は1つのポートに
  まとめる」）。**`orca` 以外の外部コマンド依存を増やすときはユーザーの承認を得る**
- 環境の実測値は `docs/requirements.md`「5. 実行環境・非機能要件」。時間が経つと変わるので、
  前提にする前にその場で確かめる

## よく使うコマンド

全体の一覧は `README.md`「開発」。ここには手が間違えやすいものだけを置く。

```bash
bun run check                 # typecheck + lint + format:check + test + test:e2e（変更後は必ずこれを通す）
bun run test                  # 単体テスト（`bun test --isolate`）。**素の `bun test` は使わない**（`mock.module` が漏れる）
bun run build                 # src/browser/ を直したら打つ（起動時には組み立てない）
bun run scripts/stop.ts       # 動いている tsukumo の一覧（--port <n> でそれ1つだけ止める）
```

## アーキテクチャ概要

**3層・プロトコル・部品の設計は `docs/design.md`、実装の全体図・設計判断・既知の制約は
`docs/architecture.md` が正典。** 原則の見出しだけを置く。

- **原則1**: **Claude Code の TUI を使わない**（上の IMPORTANT）
- **原則2**: `shared` / `server` / `browser` の3層。サーバは機能ごとに
  `src/server/<機能>/{core,adapter}/` で、**`core → adapter` は禁止**（`docs/design.md` 2章
  「サーバの機能と、機能どうしの辺」。許した辺以外は `test/architecture.test.ts` が落とす）
- **原則3**: ホスト・外部コマンド・OS に触るものは **`adapter/` の1ファイルに閉じ込める**。
  Agent SDK だけは機能の `adapter/` の `sdk-` で始まるファイル群に閉じ込める
- **原則4**: **キャラクターの中身をコードに書かない**（素材・表情・衣装の対応は定義ファイル側）
- **原則5**: 「**ファイル名が概念になっているか**」で分ける。`helpers.ts` / `utils.ts` /
  `common.ts` のような置き場所を名前にしたファイルは作らない。**ファイルもディレクトリも単数形**
  （例外にする `components/` `lib/` `utils/` などと、`src/browser/` の置き場所の基準は
  `docs/design.md` 2章）

## テスト方針

配置・モック・消す/足すの判断は `docs/coding-standards.md`「テスト」節。TDD 推奨（`/tdd`）。
**DOM の構造と画面の流れは E2E で守り、見た目（色・崩れ）は目視で確かめる**（E2E は
`docs/design.md` 10章「E2E の走らせ方」、目視は `docs/architecture.md`「手で確かめること」）。

**IMPORTANT**: 変更後は必ず `bun run check` を通してから完了を報告する。テスト件数などの根拠なしに
「完了しました」と言わない。**描画に関わる変更は、加えて何をどう確かめたか**（何が見えたか）を添える。

## コーディング規約・レビュー方針

**ルールの一覧はここが正典。** 理由・例外は `docs/coding-standards.md`（通読せず、冒頭の
「節の索引」で節を1つ特定して読む）。

**IMPORTANT**: **SDK のイベントと transcript には利用者と Claude の生の会話が入っている。**
外部に送らない・複製しない・ログに全文を出さない・テストのフィクスチャに実物を使わない
（`docs/coding-standards.md`「会話内容の扱い」）。この規約は他のどの規約よりも優先する。

- 関数はファイル内で「外から使うもの → その内部で使うもの」の順。テストのためだけに公開しない
- 変数・コレクションはイミュータブル。**引数の入れ物が呼び出し先で書き変わる契約にしない**
- 型を迂回するキャストを書かない。外部由来の値は境界で検証し、変換を1箇所に封じ込める
- 定数・テーブル・設定の定義は型注釈ではなく **`satisfies`** で検査する
- **常駐プロセスは描画1回の失敗で落ちない。** 即時終了は起動時の前提不足だけ。描画ループに
  `try`/`catch` を散らさない
- 環境変数・パスの読み取りは1モジュールに集約し、モジュールのトップレベルで触らない
- コメントは**コードから読み取れないことだけ**。経緯・採らなかった案は正典へ
- **`| undefined` は5つの場所でだけ**書き、`?:` は使わない。2つ以上の `| undefined` が1つの状態なら
  判別可能な合併型。「無い」は入口で畳む（`docs/coding-standards.md`「「無いかもしれない」値」）
- **`null` を自前の型・戻り値・`shared` に出さない**（外来の `null` は境界で `undefined` に畳む）
- **`ReactElement` を返す関数は `function` で書く**（`const` は `memo` で包むときだけ）
- **`useEffect` は「React の外と同期する」4類型だけ。** 依存配列を手で間引かない
  （代替は `docs/coding-standards.md`「React」節）
- **`Bun.*` の固有APIに寄せない**（`node:` の標準API。例外は `bun:test`）
- 可読性が良くなる場合は **remeda** を優先する
- **2つ以上の class 名をつなぐときは clsx を使う**（`docs/coding-standards.md`「class 名は clsx で組む」）
- コード・ドキュメントにタスク番号（`T-` + 3桁）を書かない（例外は `docs/requirements.md`
  「7. 未決事項」の対応タスク列）
- **案が2つ以上あるときは、書いたあとのコードを読む人が把握しやすいほうを選ぶ**（工数と行数は
  指標にしない）。**機械的な仕組みをヒューリスティックより優先する**
- 識別子は `docs/glossary.md` の「英語識別子（予定）」に合わせる（変えるなら用語集が先）

レビュー観点は `/code-review` の Standards 軸（この節＋`docs/coding-standards.md`＋
`docs/architecture.md`）と Spec 軸（`docs/requirements.md`）。

## Git運用

作業ツリーを分けるのは orca で、tsukumo は起こしたディレクトリでそのまま動く。

- **自分でブランチを切らない。** コミットはいま居るブランチへ積む。自分の作業ツリーの中は
  `git restore <file>` で戻してよい
- **`git add -A` を使わず、触ったファイルを個別に足す**（`node_modules` などの symlink が入る）
- **検証が済んだら、聞かずにコミットして `main` まで送る**（未コミットのまま待つと別のセッションに
  消される）。タスクは `task ship`、タスクに紐付かない作業の送り方は `docs/workflow.md`
  「タスクに紐付かない作業を main へ送る」
- `main` へ送る以外で他の作業ツリーへ `reset` / `branch -d` を走らせない。push は頼まれたときだけ

## タスク運用

- 検証コマンド: `bun run check`（変更後は必ずこれを通す。受け入れ判定に使う）
- 整形コマンド: `bun run format`
- ブランチ: 切らない（自分でブランチを切らない）。**枝の寿命は作業ツリーの寿命と同じ**で、
  1本の枝がいくつでもタスクを持つ

状態はチャットではなく `develop/task/`（1件1ファイル）と `develop/direction.md` に残す。手順は
`~/.claude/skills/task-workflow/WORKFLOW.md` が正典で、このリポジトリの上乗せは
`docs/workflow.md`。**タスクは `difficulty` と同じモデルのサブエージェントに委譲し**、判断が
想定より要ると分かったら押し切らず `difficulty` を上げて再開する。完了は検証できる証拠で判定する。
新しい作業ツリーの立ち上げ（`bun install` と `bun run build`）は人がやる。

**IMPORTANT**: 次は必ず人間の承認を得てから行う — 外部への公開・送信、破壊的な git 操作、
認証情報や権限の変更、**`~/.claude/settings.json` などグローバル設定の書き換え**、
**グローバルなツールの導入**。`~/.claude/settings.json` の hooks と statusLine は orca が専有して
いるので、**足すときは既存エントリを壊さず追記する。**

## ドキュメントを編集するときの罠

**`docs/` の各ファイルは冒頭の「節の索引」の表に見出し名がそのまま入っている**ので、見出し名で
探すと索引の行に先に当たる。位置は行頭から特定し（`\n### 4.7 `）、編集の前後で
`grep -c '^#\{2,3\} ' <ファイル>` の数が合うかを見る。節を削る・移す・改名するときは、引かれている
句が消えていないかを `bun run scripts/find-stray-reference.ts` で見る（`bun run check` でも落ちる）。

## 索引

| こういうとき                                                                                    | 読むもの                                                                           |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 要件・やらないこと・技術制約・未決事項を知りたい                                                | `docs/requirements.md`                                                             |
| 3層・プロトコル・部品・置き場所を決める                                                         | `docs/design.md`（置き場所は2章）                                                  |
| 色・書体・レイアウト                                                                            | `docs/screen-design.md`                                                            |
| セリフとレポートの分離・レポートの記法・各表示物の仕様                                          | `docs/display.md`                                                                  |
| 雑談モード                                                                                      | `docs/chat-mode.md`                                                                |
| なぜ今の形なのか・目視の手順・既知の制約                                                        | `docs/architecture.md`                                                             |
| 規約の理由と例外（`Date` を使わない・層の辺など lint とテストが守るものも）                     | `docs/coding-standards.md`                                                         |
| 用語と識別子                                                                                    | `docs/glossary.md`                                                                 |
| タスクを書く・受け入れる・作業ツリーを並行させる・tsukumo を起こす                              | `docs/workflow.md`                                                                 |
| コマンドの全体・環境変数・構成                                                                  | `README.md`                                                                        |
| スキル（`~/.claude/skills/`。共通なのでこのリポジトリの事情はここと `docs/workflow.md` が補う） | 毎セッションのスキル案内                                                           |
| 過去の判断の経緯（通読しない。`grep` で節を当てる）                                             | `docs/history/tasks.md` / `docs/history/progress.md` / `docs/history/direction.md` |
