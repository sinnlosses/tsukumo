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

**2026-09-13 に「描く」層をブラウザ側へ移すと決め、同日中に段7（`shared` / `server` / `browser` の
3層 + `src/cli.ts` への構造の移行）まで終えた**（WebSocket 1本、React の部品、unified の
Markdown、キャラクターパック）。**正典は [`docs/design.md`](./docs/design.md)**。残る段8
（キャラクターパック本体の移動・切り替え）と段9（セッションの復元）は独立した機能追加として
`develop/task/` に別タスクである。

**2026-09-11 に方針を全面的に見直し、2026-09-12 に旧方針の実装を撤去した。** いまは新方針
（Agent SDK で Claude Code を動かす）だけが動いている。**transcript の追従・hook と状態ファイル・
Orca 経由の入力送信はコードごと消えた**ので、ホストに依存するのはビューを開く `showView` 1つだけ。
最初に着手すべきタスクと未解決事項は [`develop/task/`](./develop/task/) が正典（`task status` で見る）。

## セットアップ / 環境構築

- Bun 1.3 以上（TypeScript をそのまま実行し、テストランナーも内蔵している）
- `bun install` で依存関係をインストールし、**`bun run build` でブラウザ側を1回組み立てる**
  （成果物は `dist/browser/`。`.gitignore` してあるので取り直すたびに要る。無いと起動が
  前提不足で止まる。2026-09-21 に起動時の組み立てをやめた）
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
bun run test                  # 単体テスト全体（`bun test --isolate`。**素の `bun test` は使わない**
                              #   — `mock.module` がファイルをまたいで漏れ、19件が落ちる）
bun test --isolate test/cli.test.ts  # 単体テストファイルのみ実行
bun run typecheck             # tsc --noEmit
bun run lint                  # oxlint（--fix は lint:fix）
bun run format                # oxfmt で自動整形（--check は format:check）
bun run build                 # ブラウザ側（src/browser/）を dist/browser/ に組み立てる。**起動時には
                              #   組み立てない**ので、bun install のあとと src/browser/ を直したあとに打つ
bun run start                 # セッションを起こし、レイアウトページのタブを Orca 内に自動で開く
                              # （`tsukumo` コマンドと同じ。TSUKUMO_OPEN_VIEW=0 で自動オープンを
                              #   止める。**本物の claude を子プロセスで起こす**ので、テストから
                              #   起動しきらない。**成果物を読むだけ**で、無ければ前提不足で止まり、
                              #   ソースのほうが新しければ1行知らせて古いまま配る）
bun run dev                   # 起動の前に bun run build で組み立ててから、start と同じ経路を
                              #   src/browser/ の見張りつきで起こす（開発用。保存すると組み立て直して
                              #   dist/browser/ に置き直し、開いているタブが入れ替わる。src/server/core/ と
                              #   src/shared/ を直したときは上げ直しが要る。docs/design.md 11章）
bun run scripts/open-views.ts <URL>  # プロセスは動いたままタブだけ閉じたときに、開き直す道具
bun run grid                  # 待ち受けていて、かつ Orca のタブもある部屋を iframe の
                              #   格子に並べた1枚の HTML にして Orca に開く。格子のタブがあるあいだ
                              #   常駐し、再読み込み（ブラウザでもページ内のボタンでも）のたびに
                              #   並べ直す。タブを閉じると終わる（Ctrl-C でも）。動いている部屋の
                              #   プロセスは変えない。打ち直すと前のタブとプロセスは入れ替わって1つ
                              #   のまま）
bun run scripts/stop.ts       # 動いている tsukumo を一覧する（--port <n> でそれ1つだけ止める。
                              #   `pkill` / `killall` は hook が拒否する。並べて動かすと
                              #   どれも `bun run src/cli.ts` に見えて区別が付かないため）
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
- **原則2**: **両側で共有する契約（`shared`）／サーバ（`server`）／
  クライアント（`browser`）に分け、層をディレクトリで表す**（`docs/design.md` 2章）。
  **サーバ側は判断（`core/`）と外の世界に触る境界（`adapter/`）に割れていて、`core → adapter` は
  禁止**（2026-09-16 に割り、2026-09-20 に入れ子にした）。**2026-09-25 に、その割りを機能の中へ
  入れると決めた**（`src/server/<機能>/{core,adapter}/`。どの機能にも属さない共有のものだけ
  `src/server/core/` `src/server/adapter/` の直下。機能どうしの辺は表にある組だけで、層ごとに
  循環させない。`docs/design.md` 2章「サーバの機能と、機能どうしの辺」）。TypeScript のモノレポでいう
  `packages/shared` + クライアント/サーバ分割に近い形で、クリーンアーキテクチャの
  「受け取る／決める／描く」の写しではない。許した依存の辺以外は `test/architecture.test.ts` が
  落とす。テストで守れるのは `shared` の畳み込みと `browser` の部品の振る舞いまでで、絵は目視
- **原則3**: ホスト（ターミナル環境）・外部コマンド・OSに依存するものは
  **`adapter/`（機能の中か共有の箱）の1ファイルに閉じ込める**（1ファイル = 1つの境界）。
  **Agent SDK だけは1つの境界が1ファイルに収まらないので、機能の `adapter/` 直下の `sdk-` で
  始まるファイルに閉じ込める**（境界が属する機能に置く。駆動は `session-driver/`、訪問の台本は
  `visit/`、日記の問い合わせは `diary/`）
- **原則4**: **キャラクターの中身をコードに書かない**（素材のパス・表情・衣装の対応は定義ファイル側）
- **原則5**: まとめるか分けるかは、行数でも関数の数でもなく「**ファイル名が概念になっているか**」で
  決める。`helpers.ts` / `utils.ts` / `common.ts` のような**置き場所を名前にしたファイルは作らない**。
  **ファイルは単数形**にし、複数は「複数返す」関数名の側で表す。**ディレクトリも単数形。ただし
  置き場所を名前にしたディレクトリ（`src/browser/` の `components/`（とその下の `page/` `domain/`
  `ui/`）`features/` `hooks/` `domain/` `stores/` `styles/`、領域・機能の中の `hooks/` `components/`
  `domain/`、どの層にも作ってよい `lib/` `utils/`）だけ bullet-proof-react の名前（`components/` の
  下の3段は利用者の Next.js の雛形の名前、と、機能の中と揃えた `domain/`）をそのまま使う**。
  画面は `components/page/<画面>/`、全画面の枠と語彙を持つ共有部品は `components/domain/`、語彙を
  持たない部品は `components/ui/`、`features/` は領域に置いてもらう機能だけ（`docs/design.md` 2章）。
  **tsukumo の語彙を名乗り、2つ以上の領域・機能が読むもの（部品でないもの）は `src/browser/domain/`**（`lib/` は
  ライブラリを包む道具だけ。読み手が1つに戻ったらその中へ下ろす）。**`presentational-<機能>.tsx` は container と対に
  なっているときだけ例外として許す**（`docs/design.md` 2章「機能の中を分ける」）。
  **`lib/` と `utils/` のどちらに置くかの基準は `docs/design.md` 2章
  「`lib/` と `utils/` に置く基準」が正典**（`helpers/` と `common/` は作らない）

**3層・プロトコル・部品・段階の設計は [`docs/design.md`](./docs/design.md) が正典。
実装の全体図、過去の設計判断（なぜこの形なのか）、描画の目視確認の手順、既知の制約は
[`docs/architecture.md`](./docs/architecture.md) が正典。** 上の原則で迷ったら必ずそちらを開く
（このファイルには判断材料を二重に書かない）。

## テスト方針

配置・モック・カバレッジの扱い・テストを消す/足すの判断は
[`docs/coding-standards.md`](./docs/coding-standards.md)「テスト」節が正典（ここには二重に
書かない）。TDD推奨（`/tdd` スキル参照）。

**DOM の構造と画面の流れは E2E で守り、見た目（色・崩れ）は目視で確かめる。** E2E は fake driver で
起こした tsukumo を手元の Chrome で開き、DOM の構造と WebSocket の流れを期待値と比べる
（`bun run check` の最後の段に入れる。足場はまだ無く、形は `docs/design.md` 10章「E2E の走らせ方」）。目視の手順は
`docs/architecture.md`「手で確かめること」。

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
- **定数・テーブル・設定の定義は型注釈ではなく `satisfies` で検査する**（リテラルの型を保つ）。
  値より先に型が要る場所（再帰的な型・関数の引数・型引数）だけ注釈でよい
- **常駐プロセスは描画1回の失敗で落ちない。** 起動時の前提不足だけが即時終了で、動作中の
  一時的な失敗はその回を諦めて次へ進む。**描画ループの中に `try`/`catch` を散らさない**
- 外の世界に依存する値（環境変数・パス）は読み取りを1モジュールに集約する。モジュールの
  トップレベルで環境変数に触らない
- コメントは**コードから読み取れないことだけ**を書く。残すかどうかは長さではなく種類で決める
  （今の挙動の制約・前提は残す、昔の経緯は正典へ）。正典は `docs/architecture.md` /
  `docs/glossary.md` / `docs/requirements.md`
- **`| undefined` は5つの場所でだけ書いてよい**（外の世界を写した直後・TypeScript が生むもの・
  React が型で要求するもの・React の外の資源を持つ可変の入れ物・丸ごと省略できるオプション
  引数の中身）。当てはまらないものは合併型にするか入口で畳む。書き方は
  `readonly x: T | undefined` で `?:` は使わない（`?:` でよいのは5つ目だけ）。判定の表は
  `docs/coding-standards.md`「「無いかもしれない」値」が正典
- **2つ以上の `| undefined` が1つの状態を表しているなら、判別可能な合併型にする。**
  「無い」は入口で畳み、内側の関数は「必ず値がある」型で受ける（層をまたいで運ばない）
- **`null` を自前の型・関数の戻り値・`shared` に出さない。** 書いてよいのは React の作法
  （`useRef` の初期値・「何も描かない」）・外来APIの戻り値・`!== null` の型ガードだけで、
  外来の `null` は受け取った境界で `undefined` に畳む
- **`ReactElement` を返す関数は関数宣言（`function`）で書く。** `const` に入れてよいのは
  `memo` で包むときだけで、中身は `function <部品名>View(...)` のまま下に置く
  （`docs/coding-standards.md`「部品は `function` で書く」）
- **`useEffect` は「React の外と同期する」4類型だけ**（外部システムの購読・React の外にある
  状態への書き込み・タイマー・外部からの読み込み）。外れるものは書かず、まず
  `docs/coding-standards.md`「React」節の代替の表を見る。**依存配列を手で間引かない**
- **`Bun.*` の固有APIに寄せない。** ファイル・パス・プロセスは `node:` プレフィックスの標準APIを
  使う（唯一の例外は `bun:test`）。理由は `docs/coding-standards.md`「Bun固有APIに寄せない」
- **可読性が良くなる場合は remeda を優先する。** 手書きの `reduce` での合計・グループ分け・
  比較関数などは、remeda に同じ関数があれば使う。寄せないものの線引きは
  `docs/coding-standards.md`「可読性が良くなる場合は remeda を優先する」を参照
- **`Date` を使わない。** 時刻は `Temporal`（`Temporal.Now` / `Temporal.Instant` /
  `Temporal.ZonedDateTime` など）で扱う。`.oxlintrc.json` の `no-restricted-globals` で検査する
  （例外は無い）。理由は `docs/coding-standards.md`「`Date` を使わない」
- コード・ドキュメントにタスク番号（`T-` + 3桁）を書かない（唯一の例外は
  `docs/requirements.md`「7. 未決事項」の対応タスク列）
- **案が2つ以上あるときは、書いたあとのコードを読む人が把握しやすいほうを選ぶ。**
  物差しは「開くファイルの数」「呼ぶ側が自分の外の事情を知らずに済むか」「前提が変わった
  ときに黙って効かなくならないか」の3つで、工数と行数は指標にしない
- **解決策を提案・選択するときは、機械的な仕組みをヒューリスティックより優先する。**
  優先の順・このリポジトリにある実例・ヒューリスティックを採るときの条件は
  `docs/coding-standards.md`「仕組みをヒューリスティックより優先する」が正典

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

- `next-task`: `develop/task/` の未着手タスクを1件実行する。`/loop /next-task` で
  全件`done`になるまでの自動進行に使う
- `plan-tasks`: `develop/direction.md` の指示をタスクに分解して `develop/task/` に登録し、
  指示メモを `docs/history/direction.md` へ移す。**分解は方針決めを含むので委譲せず、
  `/loop` にも載せない**
- `list-tasks`: 登録済みタスクを一覧の表で見るだけ（読み取り専用）
- `retrospect`: 見つけたことを `develop/direction.md` の `## エージェントのドラフト` に積む。
  **ドキュメントもタスクも直接は書き換えない**（承認ゲートを通す）。**1件ごとの振り返りは
  `/next-task` が受け入れのあとに行い、`/loop` からも走る**が、兆候に当たったときだけ積み、
  `## 結果` に `- 振り返り:` の1行を残す。**手で呼ぶとまとめての振り返り**で、
  `develop/retrospective.md` に記録したコミットから先のタスクのうち、その1行が無いものを見る
  （こちらは `/loop` に載せない。無人で広い範囲を見ると根拠の薄い気づきが溜まるため）

**共通のスキルはこのリポジトリの事情を知らない。** spec の出典（`docs/requirements.md` と
`develop/task/` の各タスク本文）、standards の出典（この `CLAUDE.md` ＋
`docs/coding-standards.md` ＋ `docs/architecture.md`）、`main` に直接コミットすること、
タスクを書くときの上乗せは、**このファイルと `docs/workflow.md` が補う**。

## Git運用

**作業ツリーを分けるのは orca で、tsukumo はやらない**（2026-09-23 に tsukumo 側の worktree
運用を撤去した。`docs/architecture.md`「worktree を用意するのは orca で、tsukumo はやらない」）。
tsukumo は**起こしたディレクトリでそのまま claude を動かす**ので、いま居る作業ツリーと
ブランチがそのまま1セッションぶんの入れ物になっている。

- **自分でブランチを切らない。** 切り替えても分離は増えない。コミットはいま居るブランチへ積む
- **自分の作業ツリーの中は自分しか書かない**ので、`git checkout <file>` / `git restore <file>` で
  戻してよい
- **コミットは `git add -A` を使わず、触ったファイルを個別に足す**（`node_modules` と
  `characters/local` の symlink は `.gitignore` の行の末尾が `/` なので当たらず、
  `?? node_modules` として出続ける。一括で足すと入ってしまう）
- **`main` へ入れるまでが開発のひと区切り。** タスクの作業は `task ship`（rebase →
  fast-forward。「## タスク運用」参照）が送る。**タスクに紐付かない作業**（会話で頼まれた
  雑多な変更）も、検証（`bun run check`、描画に関わるなら目視も）が済んだら自分の枝に
  コミットして `main` へ送る。**送ってよいか聞いて止まらない**——未コミットのまま待つと、
  作業ツリーを後から使うセッションが `git restore` で捨てうる（2026-09-23 に実際に9ファイル
  ぶんが痕跡なく消えた）。送るときは `main` を出している作業ツリーを指して
  `git -C <本体> merge --ff-only <いまの枝>` を走らせる（`main` はそこで checkout 済みなので、
  自分の作業ツリーでは切り替えられない）。**本体が clean なことを先に確かめる**。
  `--ff-only` が落ちたら `git rebase main` で取り込み、`bun run check` を通し直してから送り直す
- **`main` へ送る以外で他の作業ツリーへ `reset` / `branch -d` を走らせない**（自分の足元だけを触る）
- push は明示的に頼まれたときだけ

## タスク運用

- 検証コマンド: `bun run check`（変更後は必ずこれを通す。受け入れ判定に使う）
- 整形コマンド: `bun run format`
- ブランチ: 切らない（自分でブランチを切らない）。**枝の寿命は作業ツリーの寿命と同じ**で、
  1本の枝がいくつでもタスクを持つ

`develop/task/`（1件1ファイル）と `develop/direction.md` で管理する。指示は
`develop/direction.md` に溜め、`/plan-tasks` でタスク化して `/next-task` で進める。
**1サイクル（`task claim` → やることを調べ直す → 作業 → 受け入れ → `task done` → 1コミット →
`task ship`）と `task` コマンドの手順は共通の `~/.claude/skills/task-workflow/WORKFLOW.md`
「1サイクル」「送り出し」が正典**で、手順への独自の上乗せは無い（経緯は `docs/workflow.md`
「関連」）。並行して複数の作業ツリーでタスクを進めるときの注意（ポートとホームの分離など）は
`docs/workflow.md`「作業ツリーを並行させるとき」を見る。

- **新しい作業ツリーの立ち上げは人がやる**（`bun install` と `bun run build`。
  `node_modules` と `dist/browser/` は `.gitignore` なので、切った直後は `bun run check` も
  `bun run start` も通らない。自動化はしない——2026-09-23 決定）

## 進捗管理とHandoff

会話やセッションが切れても再開できるよう、状態はチャットではなく `develop/` 配下の
`task/`（1件1ファイル）に記録する。ユーザーからの指示も同様に `direction.md` に書く。
**各手順の詳細（フィールド定義・difficultyの基準と委譲の書き方・evidenceの粒度・1サイクルの
手順）は `~/.claude/skills/task-workflow/WORKFLOW.md` が正典**（複数のプロジェクトで共通）。
**このリポジトリでの上乗せだけ**が [`docs/workflow.md`](./docs/workflow.md) にある。

セッション開始時の確認（見渡す・`develop/direction.md` の未タスク化の指示があれば先に
`/plan-tasks`）と、着手から完了までの手順は `/next-task` スキルに従う。**タスクは
`difficulty` と同じモデルを指定したサブエージェントに委譲**する（メインセッションのモデルは
判断材料にしない）。想定より判断が必要だと分かったら、その場で押し切らず `difficulty` を
上げてから再開する。完了の判定はテスト結果・生成物・実行ログなど検証可能な証拠で行う
（宣言だけで合格にしない）。**描画に関わる変更は目視確認の結果も証拠に含める**。

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

**節を削る・移す・見出しを変えるときは、ほかから「ファイル名＋番号＋「句」」で引かれている句が
消えていないかも見る。** `bun run check` の `test/section-reference.test.ts` が、参照先に文字として
無い句を落とす（一覧だけなら `bun run scripts/find-stray-reference.ts`。拾う形と照合の強さは
`scripts/section-reference.ts` の冒頭）。

## 関連リンク

- 要件定義（やること・**やらないこと**・技術制約・環境の実測値・未決事項）: `docs/requirements.md`
- **設計書（移行後の形。3層・プロトコル・部品・キャラクターパック・移行の段階）: `docs/design.md`**
- 画面のデザイン（色・書体・レイアウトの計画とトークン、誰が差せるか、雑談モードの画面、背景、
  画面のナビの帯。節の番号は `docs/design.md` 13章だったときの `13.x` のまま）: `docs/screen-design.md`
- 表示（セリフとレポートの出力分離、レポートの記法の規約、立ち絵・吹き出し・メインビュー・
  入力欄・サイドバーなど各表示物の仕様。節の番号はもとの `4.2` のままで、移す前は
  `docs/requirements.md` にあった）: `docs/display.md`
- 雑談モード（遡れる幅、記憶の圧縮と忘却、残す旗、会話のアーカイブ、人格への書き戻し。
  節の番号はもとの `4.9` のままで、移す前は `docs/requirements.md` にあった）: `docs/chat-mode.md`
- アーキテクチャ詳細（全体図、設計判断、目視確認の手順、既知の制約）: `docs/architecture.md`
- コーディング規約の詳細（各ルールの理由・例外、**会話内容の扱い**）: `docs/coding-standards.md`
- 用語集（日本語表記とコード上の識別子の対応、避ける言い方）: `docs/glossary.md`
- 進捗管理の詳細（`develop/` の task/・direction.md のフィールド定義・
  evidenceの粒度・1サイクルの手順）: `~/.claude/skills/task-workflow/WORKFLOW.md`（共通の正典）と
  `docs/workflow.md`（このリポジトリでの上乗せ）
- 検討当時のユーザーの指示メモ: `docs/history/direction.md`
- 完了タスク・過去セッションの記録: `docs/history/tasks.md` /
  `docs/history/progress.md`（`progress.md` を無くすまでの記録）。セッション開始時に読む
  必要はない。過去の判断の経緯をたどりたいときだけ、`grep` で該当する節を見つけて
  そこだけ参照する。**通読しない**
- Issueトラッカー・外部の設計ドキュメントは未設定（今後追加され次第ここに記載する）
