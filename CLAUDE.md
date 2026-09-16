# CLAUDE.md

## 対話言語

ユーザーとの対話は常に日本語で行う。

## プロジェクト概要

**tsukumo** は、**キャラクターと一緒に楽しく仕事をするためのターミナル環境**。
立ち絵・吹き出し・セリフと詳細の分離・画面レイアウトは、**すべてこの目的のための手段**であって
目的ではない。名前は付喪神から。

実現の手段は、**tsukumo が Claude Code を動かすこと**。Agent SDK
（`@anthropic-ai/claude-agent-sdk`）で claude を子プロセスとして起こし、会話・ツール実行・
許可プロンプト・質問を構造化イベントで受け取る。**Claude Code の TUI は使わない**（2026-09-11 の
方針転換）。**表示はすべて HTML** で、入力欄も含めて Orca 内のブラウザタブに出す1枚のページ
（メインビュー・キャラビュー・サイドバー・入力欄）になる。セリフは tsukumo が提供する MCP ツール
`speak(text, expression)` で受け取り（キャラビューの吹き出し）、ターンの本文はレポートとして
メインビューに出す。**箱（いまは Orca のタブ）と中身（Web アプリ）は分ける。**

詳細な要件・スコープ外・調査の経緯は [`docs/requirements.md`](./docs/requirements.md) を参照。
対象ユーザーは作者本人のみ。**機能を足そうとする前に同ドキュメント「1. 概要・目的」と
「2.2 対象外とすること」を見る**（足すかどうかは上の目的に沿うかで決める）。

**IMPORTANT**: 本体のTUIに描画を混ぜる方式（パイプ・hook の stdout）は技術的に不可能。
**だから TUI を使わず、SDK で動かす側に回る。** 設計を別の形に変えようとする前に
`docs/requirements.md`「3. 技術制約」と `docs/architecture.md`「Claude Code の TUI を捨て、
SDK で動かす」を必ず読む（採らなかった案もそこにある）。

## 現在の状態

**2026-09-13 に「描く」層をブラウザ側へ移すと決め、同日中に段7（`protocol` / `core` / `ui` の
3層 + `src/cli.ts` への構造の移行）まで終えた**（WebSocket 1本、React の部品、unified の
Markdown、キャラクターパック）。**正典は [`docs/design.md`](./docs/design.md)**。残る段8
（キャラクターパック本体の移動・切り替え）と段9（セッションの復元）は独立した機能追加として
`develop/tasks.json` に別タスクである。

**2026-09-11 に方針を全面的に見直し、2026-09-12 に旧方針の実装を撤去した。** いまは新方針
（Agent SDK で Claude Code を動かす）だけが動いている。**transcript の追従・hook と状態ファイル・
Orca 経由の入力送信はコードごと消えた**ので、ホストに依存するのはビューを開く `showView` 1つだけ。
最初に着手すべきタスクと未解決事項は [`develop/progress.md`](./develop/progress.md) が正典。

## セットアップ / 環境構築

- Bun 1.3 以上（TypeScript をそのまま実行し、テストランナーも内蔵している）
- `bun install` で依存関係をインストール
- **`tsukumo` コマンドは `bun link` でグローバルに入っている**（2026-09-12 実施。
  `~/.bun/bin/tsukumo` がリポジトリの `bin/tsukumo` を指すシンボリックリンク。開発中の変更が
  そのまま反映される）。**消すときはリポジトリの直下で `bun unlink`**。
  詳細は `docs/requirements.md` 4.6
- **Orca に依存してよい。** 画面レイアウトの組み立ても詳細ビューも `orca` コマンドを使う。
  ただし**ホスト（ターミナル環境）に依存する操作は1つの抽象の裏に置く**。後で VS Code など別の
  ホストに載せ替えたくなったときに、差し替える場所が1箇所で済むようにする
  （`docs/architecture.md`「ホスト依存の操作は1つのポートにまとめる」）
- **`orca` 以外の外部コマンド依存を増やすときはユーザーの承認を得る**

環境の実測値（macOS / 端末 / 導入済み・未導入コマンド）は
`docs/requirements.md`「5. 実行環境・非機能要件」を参照。**実測値は時間が経つと変わる**ので、
前提にする前にその場で確認する。

## よく使うコマンド

```bash
bun run check                 # typecheck + lint + format:check + test（変更後は必ずこれを通す）
bun run test                  # テスト全体（`bun test --isolate`。**素の `bun test` は使わない**
                              #   — `mock.module` がファイルをまたいで漏れ、19件が落ちる）
bun test --isolate test/cli.test.ts  # 単体テストファイルのみ実行
bun run typecheck             # tsc --noEmit
bun run lint                  # oxlint（--fix は lint:fix）
bun run format                # oxfmt で自動整形（--check は format:check）
bun run start                 # セッションを起こし、レイアウトページのタブを Orca 内に自動で開く
                              # （`tsukumo` コマンドと同じ。TSUKUMO_OPEN_VIEW=0 で自動オープンを
                              #   止める。**本物の claude を子プロセスで起こす**ので、テストから
                              #   起動しきらない）
bun run dev                   # start と同じだが src/ui/ を見張る（開発用。保存すると開いている
                              #   タブが組み立て直したものに入れ替わる。src/core/ と src/protocol/ を
                              #   直したときは上げ直しが要る。docs/design.md 11章）
bun run scripts/open-views.ts <URL>  # プロセスは動いたままタブだけ閉じたときに、開き直す道具
```

## アーキテクチャ概要

tsukumo は1つのプロセスで、Agent SDK で Claude Code を子プロセスとして起こし、受け取った
イベントを HTML のビューに変えて `127.0.0.1` のローカル HTTP サーバから配る。ビューは
Orca 内のブラウザタブに出て、**入力もそこで行う**（入力欄 → tsukumo → SDK）。
**会話は tsukumo のプロセスの外へ出さない**（SDK もツールもローカルのプロセス内で閉じる。
`speak` の戻り値は `"ok"` だけ）。

ここには**原則の見出しだけ**を置く。

- **原則1**: **Claude Code の TUI を使わない。** TUI には割り込めないので、パイプ・hook の
  stdout・本体へのパッチを経路にせず、SDK で動かす側に回る
- **原則2**: **両側で共有する契約（`protocol`）／サーバ（`core` と `adapter`）／
  クライアント（`ui`）に分け、層をディレクトリで表す**（`docs/design.md` 2章）。
  **サーバ側は判断（`core`）と外の世界に触る境界（`adapter`）に割れていて、`core → adapter`
  は禁止**（2026-09-16）。TypeScript のモノレポでいう
  `packages/shared` + クライアント/サーバ分割に近い形で、クリーンアーキテクチャの
  「受け取る／決める／描く」の写しではない。許した依存の辺以外は `test/architecture.test.ts` が
  落とす。テストで守れるのは `protocol` の畳み込みと `ui` の部品の振る舞いまでで、絵は目視
- **原則3**: ホスト（ターミナル環境）・外部コマンド・OSに依存するものは
  **`src/adapter/` の1ファイルに閉じ込める**（1ファイル = 1つの境界）
- **原則4**: **キャラクターの中身をコードに書かない**（素材のパス・表情・衣装の対応は定義ファイル側）
- **原則5**: まとめるか分けるかは、行数でも関数の数でもなく「**ファイル名が概念になっているか**」で
  決める。`helpers` / `utils` / `common` のような**置き場所を名前にしたファイルは作らない**。
  **ディレクトリもファイルも単数形**にし、複数は「複数返す」関数名の側で表す

**3層・プロトコル・部品・段階の設計は [`docs/design.md`](./docs/design.md) が正典。
実装の全体図、過去の設計判断（なぜこの形なのか）、描画の目視確認の手順、既知の制約は
[`docs/architecture.md`](./docs/architecture.md) が正典。** 上の原則で迷ったら必ずそちらを開く
（このファイルには判断材料を二重に書かない）。

## テスト方針

配置・モック・カバレッジの扱い・テストを消す/足すの判断は
[`docs/coding-standards.md`](./docs/coding-standards.md)「テスト」節が正典（ここには二重に
書かない）。TDD推奨（`/tdd` スキル参照）。

**ブラウザに出た絵は自動テストで守らない。** 配信（バインド先・経路・push）まではテストし、
実際に見えているかは目視で確認する。手順は `docs/architecture.md`「手で確かめること」。

**IMPORTANT**: 変更後は必ず `bun run check` を通してから完了を報告する。テスト件数・エラーなどの
根拠なしに「完了しました」と言わない。**描画に関わる変更は、加えて何をどう確かめたか**
（どの端末で、何が見えたか）を添える。

## CI/CD

未設定。`bun run check` をそのまま回せる形にはなっているので、必要になった時点で足す。

## コーディング規約・レビュー方針

**ルールの一覧**（理由・例外は [`docs/coding-standards.md`](./docs/coding-standards.md) が正典。
ただし**通読しない**。冒頭の「節の索引」で節を1つ特定して、その節だけを読む）:

- 関数はファイル内で「外から使うもの → その内部で使うもの」の順に並べる。テストのためだけに
  公開しない
- 変数は基本イミュータブル。コレクションも不変に保ち、**引数として渡した入れ物が呼び出し先で
  書き変わる契約にしない**
- 型を迂回するキャストを書かない。外部由来の値（SDK のイベント・定義ファイル・環境変数）は
  境界で検証し、変換を1箇所に封じ込める
- **常駐プロセスは描画1回の失敗で落ちない。** 起動時の前提不足だけが即時終了で、動作中の
  一時的な失敗はその回を諦めて次へ進む。**描画ループの中に `try`/`catch` を散らさない**
- 外の世界に依存する値（環境変数・パス）は読み取りを1モジュールに集約する。モジュールの
  トップレベルで環境変数に触らない
- コメントは**コードから読み取れないことだけ**を書く。残すかどうかは長さではなく種類で決める
  （今の挙動の制約・前提は残す、昔の経緯は正典へ）。正典は `docs/architecture.md` /
  `docs/glossary.md` / `docs/requirements.md`
- 「無いかもしれない」プロパティは `readonly x: T | undefined` で書き、`?:` は使わない
  （例外は丸ごと省略できるオプション引数の中身のみ）。「無い」を型から消すことを目的にしない
- **`Bun.*` の固有APIに寄せない。** ファイル・パス・プロセスは `node:` プレフィックスの標準APIを
  使う（唯一の例外は `bun:test`）。理由は `docs/coding-standards.md`「Bun固有APIに寄せない」
- コード・ドキュメントにタスク番号（`T-` + 3桁）を書かない（唯一の例外は
  `docs/requirements.md`「7. 未決事項」の対応タスク列）

**IMPORTANT**: **SDK のイベントと transcript には利用者と Claude の生の会話が入っている。**
外部に送らない、別の場所に複製しない、ログに全文を出さない、テストのフィクスチャに実物を使わない。
詳細は `docs/coding-standards.md`「会話内容の扱い」。この規約は他のどの規約よりも優先する。

レビュー観点は `/code-review` スキルのStandards軸（上記＋`docs/coding-standards.md`＋
`docs/architecture.md`）とSpec軸（`docs/requirements.md`）を参照。

## 用語

立ち絵・吹き出し・セリフ・詳細・サイドバー・表情・衣装・ターン・セッション・speak ツールと
いった用語は
[`docs/glossary.md`](./docs/glossary.md) が正典。**コード上の識別子もそこの「英語識別子（予定）」に
合わせる**（変えたくなったら先に用語集を直してからコードを直す）。

## 導入済みスキル

**スキルはすべて `~/.claude/skills/` にある**（複数のプロジェクトで共通。2026-09-12 に
リポジトリ内の複製を削除した）。一覧は毎セッションのスキル案内を参照。

タスク運用の3つ（`next-task` / `plan-tasks` / `list-tasks`）は **`task-workflow` スキルの
`WORKFLOW.md` を正典**とし、**プロジェクト固有の値はこの `CLAUDE.md` の「## タスク運用」節**
（検証コマンド・整形コマンド・ブランチ運用）から読む。

- `next-task`: `develop/tasks.json` の未着手タスクを1件実行する。`/loop /next-task` で
  全件`done`になるまでの自動進行に使う
- `plan-tasks`: `develop/direction.md` の指示をタスクに分解して `develop/tasks.json` に登録し、
  指示メモを `docs/history/direction.md` へ移す。**分解は方針決めを含むので委譲せず、
  `/loop` にも載せない**
- `list-tasks`: 登録済みタスクを一覧の表で見るだけ（読み取り専用）

**共通のスキルはこのリポジトリの事情を知らない。** spec の出典（`docs/requirements.md` と
`develop/tasks.json` の各タスク本文）、standards の出典（この `CLAUDE.md` ＋
`docs/coding-standards.md` ＋ `docs/architecture.md`）、`main` に直接コミットすること、
タスクを書くときの上乗せは、**このファイルと `docs/workflow.md` が補う**。

## Git運用

**ブランチを切らず `main` へ直接コミットする**（`/next-task` も含めて全部。`task-workflow` の
既定は「1タスク＝1ブランチ」だが、「## タスク運用」節の `- ブランチ:` 行で上書きしている）。
**作業ツリーが1つのまま並行してセッションを動かすので、ブランチを切っても分離にならない。**
切り替えた側がもう一方の足元のファイルを入れ替えてしまい、`main` へ直接でよいはずのコミットも
作業ブランチに乗る（2026-09-16 に一度ブランチ運用へ変えたが、同日この理由で戻した。分離が要るなら
worktree だが、未コミットの変更はブランチをまたいで残るので不要と判断している。経緯は
`docs/history/direction.md` の 2026-09-16）。push は明示的に頼まれたときだけ。

**他のセッションの未コミット変更を巻き込まない。** 同じ作業ツリーで複数のセッションが動くので、
自分が触っていない変更が `git status` に出ている前提で操作する:

- コミットは `git add -A` を使わず、触ったファイルを個別に足す
- **`git checkout <file>` / `git restore <file>` で作業ツリーを戻さない**（自分が作っていない
  変更まで消える）。編集をやり直すなら行単位で戻す
- `develop/tasks.json` を書き換えたら、その場でファイル指定でコミットまで済ませる

## タスク運用

- 検証コマンド: `bun run check`（変更後は必ずこれを通す。受け入れ判定に使う）
- 整形コマンド: `bun run format`
- ブランチ: 切らない。直接 main にコミットする

`develop/tasks.json`・`develop/progress.md`・`develop/direction.md` で管理する。
指示は `develop/direction.md` に溜め、`/plan-tasks` でタスク化して `/next-task` で進める。

## 進捗管理とHandoff

会話やセッションが切れても再開できるよう、状態はチャットではなく `develop/` 配下の
`tasks.json` / `progress.md` に記録する。ユーザーからの指示も同様に `direction.md` に書く。
**各手順の詳細（フィールド定義・difficultyの基準と委譲の書き方・evidenceの粒度・アーカイブの
トリガーと手順）は `~/.claude/skills/task-workflow/WORKFLOW.md` が正典**（複数のプロジェクトで
共通）。**このリポジトリでの上乗せだけ**が [`docs/workflow.md`](./docs/workflow.md) にある。

1. セッション開始時に `develop/progress.md` と `develop/tasks.json` を読み、アーカイブすべき
   タイミングなら作業前にアーカイブする（**両方が判定の対象**。基準は `task-workflow` の
   `WORKFLOW.md`）。
   `develop/direction.md` に見出し以外の中身があれば未タスク化の指示が残っているので、
   他の作業より先に `/plan-tasks` でタスク化する
2. `tasks.json` から依存が完了済みの `todo` タスクを1つ選ぶ
3. 作業する。タスクは **`difficulty` と同じモデルを指定したサブエージェントに委譲**する
   （メインセッションのモデルは判断材料にしない）。想定より判断が必要だと分かったら、
   その場で押し切らず `difficulty` を上げてから再開する
4. 完了の判定はテスト結果・生成物・実行ログなど検証可能な証拠で行う（宣言だけで合格にしない）。
   **描画に関わる変更は目視確認の結果も証拠に含める**
5. `develop/tasks.json` の `status`/`passes`/`evidence` と `develop/progress.md` を更新する

**IMPORTANT**: 以下は必ず人間の承認を得てから行う — 外部への公開・送信、破壊的なgit操作、
認証情報や権限の変更、**`~/.claude/settings.json` などユーザーのグローバル設定の書き換え**、
**グローバルなツールの導入**。

**IMPORTANT**: `~/.claude/settings.json` の hooks と statusLine は orca
（`~/.orca/agent-hooks/`）が専有している（**tsukumo のエントリは 2026-09-12 に外した**）。
**設定を足すときは既存エントリを壊さず追記する。** 上書きすると orca 側が黙って動かなくなる。

## ドキュメントを編集するときの罠

**`docs/` の各ファイルは冒頭に「節の索引」の表を持ち、そこに節の見出し名がそのまま入っている。**
見出し名で位置を探すと**索引の行に先に当たる**。実際に `docs/requirements.md` の 4.7 節を
置き換えようとして、索引テーブルの中に本文を流し込んでしまった事故がある（2026-09-10）。

編集するときは**行頭を含めて位置を特定する**（`\n### 4.7 ` のように改行から始める）。
置換後は**節の一覧が変わっていないか**を確かめる:

```bash
grep -c '^#\{2,3\} ' docs/requirements.md   # 編集の前後で数が合うか
```

## 関連リンク

- 要件定義（やること・**やらないこと**・技術制約・環境の実測値・未決事項）: `docs/requirements.md`
- **設計書（移行後の形。3層・プロトコル・部品・キャラクターパック・移行の段階）: `docs/design.md`**
- アーキテクチャ詳細（全体図、設計判断、目視確認の手順、既知の制約）: `docs/architecture.md`
- コーディング規約の詳細（各ルールの理由・例外、**会話内容の扱い**）: `docs/coding-standards.md`
- 用語集（日本語表記とコード上の識別子の対応、避ける言い方）: `docs/glossary.md`
- 進捗管理の詳細（`develop/` の tasks.json・progress.md・direction.md のフィールド定義・
  evidenceの粒度・アーカイブ運用）: `~/.claude/skills/task-workflow/WORKFLOW.md`（共通の正典）と
  `docs/workflow.md`（このリポジトリでの上乗せ）
- 検討当時のユーザーの指示メモ: `docs/history/direction.md`
- 完了タスク・過去セッションの記録: `docs/history/tasks.md` /
  `docs/history/progress.md`（セッション開始時に読む必要はない。過去の判断の経緯を
  たどりたいときだけ、`grep` で該当する節を見つけてそこだけ参照する。**通読しない**）
- Issueトラッカー・外部の設計ドキュメントは未設定（今後追加され次第ここに記載する）
