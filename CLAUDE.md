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
`develop/tasks.json` に別タスクである。

**2026-09-11 に方針を全面的に見直し、2026-09-12 に旧方針の実装を撤去した。** いまは新方針
（Agent SDK で Claude Code を動かす）だけが動いている。**transcript の追従・hook と状態ファイル・
Orca 経由の入力送信はコードごと消えた**ので、ホストに依存するのはビューを開く `showView` 1つだけ。
最初に着手すべきタスクと未解決事項は [`develop/progress.md`](./develop/progress.md) が正典。

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
- **`develop/progress.md` 用のマージドライバはクローンに1回登録する**（`.gitattributes` の
  `merge=progress` だけでは効かず、`git config` は作業ツリーではなくクローン共有の
  `.git/config` に書くので、新しい作業ツリーごとには要らない。「新しい作業ツリーの立ち上げは
  人がやる」と同じく人が打つ）:
  ```bash
  git config merge.progress.driver "bun run scripts/merge-progress.ts %O %A %B"
  ```
  未登録のあいだは git が黙って既定の3wayに落ちるだけで、壊れることはない
  （`scripts/merge-progress.ts` 冒頭のコメント）

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
  **サーバ側は判断（`src/server/core/`）と外の世界に触る境界（`src/server/adapter/`）に
  割れていて、`core → adapter` は禁止**（2026-09-16 に割り、2026-09-20 に入れ子にした）。TypeScript のモノレポでいう
  `packages/shared` + クライアント/サーバ分割に近い形で、クリーンアーキテクチャの
  「受け取る／決める／描く」の写しではない。許した依存の辺以外は `test/architecture.test.ts` が
  落とす。テストで守れるのは `shared` の畳み込みと `browser` の部品の振る舞いまでで、絵は目視
- **原則3**: ホスト（ターミナル環境）・外部コマンド・OSに依存するものは
  **`src/server/adapter/` の1ファイルに閉じ込める**（1ファイル = 1つの境界）
- **原則4**: **キャラクターの中身をコードに書かない**（素材のパス・表情・衣装の対応は定義ファイル側）
- **原則5**: まとめるか分けるかは、行数でも関数の数でもなく「**ファイル名が概念になっているか**」で
  決める。`helpers.ts` / `utils.ts` / `common.ts` のような**置き場所を名前にしたファイルは作らない**。
  **ファイルは単数形**にし、複数は「複数返す」関数名の側で表す。**ディレクトリも単数形。ただし
  置き場所を名前にしたディレクトリ（`src/browser/` の `features/` `components/` `hooks/` `stores/`
  `styles/`、機能の中の `hooks/` `components/` `domain/`、どの層にも作ってよい `lib/` `utils/`）だけ
  bullet-proof-react の名前をそのまま使う**。**`presentational-<機能>.tsx` は container と対に
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
- **`Date` を使わない。** 時刻は `Temporal`（`Temporal.Now` / `Temporal.Instant` /
  `Temporal.ZonedDateTime` など）で扱う。`.oxlintrc.json` の `no-restricted-globals` で検査する
  （例外は無い）。理由は `docs/coding-standards.md`「`Date` を使わない」
- コード・ドキュメントにタスク番号（`T-` + 3桁）を書かない（唯一の例外は
  `docs/requirements.md`「7. 未決事項」の対応タスク列）
- **案が2つ以上あるときは、書いたあとのコードを読む人が把握しやすいほうを選ぶ。**
  物差しは「開くファイルの数」「呼ぶ側が自分の外の事情を知らずに済むか」「前提が変わった
  ときに黙って効かなくならないか」の3つで、工数と行数は指標にしない

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
- `retrospect`: `develop/retrospective.md` に記録したコミットから先の**まだ振り返っていない
  タスク**を振り返り、見つけたことを `develop/direction.md` の `## エージェントのドラフト` に
  積む。**ドキュメントもタスクも直接は書き換えない**（承認ゲートを通す）。**手で呼ぶ。
  `/loop` には載せない**（無人だと根拠の薄い気づきが溜まるため）

**共通のスキルはこのリポジトリの事情を知らない。** spec の出典（`docs/requirements.md` と
`develop/tasks.json` の各タスク本文）、standards の出典（この `CLAUDE.md` ＋
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
- **`main` へ入れるのは、タスクの1サイクル（「## タスク運用」の手順3・5）と、頼まれたとき。**
  入れるときは `main` を出している作業ツリーを指して `git -C <本体> merge --ff-only <いまの枝>`
  を走らせる（`main` はそこで checkout 済みなので、自分の作業ツリーでは切り替えられない）。
  **本体が clean なことを先に確かめる**
- **それ以外で他の作業ツリーへ `reset` / `branch -d` を走らせない**（自分の足元だけを触る）
- push は明示的に頼まれたときだけ

## タスク運用

- 検証コマンド: `bun run check`（変更後は必ずこれを通す。受け入れ判定に使う）
- 整形コマンド: `bun run format`
- ブランチ: 自分で切らない。**枝の寿命は作業ツリーの寿命と同じ**で、1本の枝がいくつでも
  タスクを持つ（`/next-task` の手順3は何もしない。手順8のブランチの削除もしない）

`develop/tasks.json`・`develop/progress.md`・`develop/direction.md` で管理する。
指示は `develop/direction.md` に溜め、`/plan-tasks` でタスク化して `/next-task` で進める。

### 1サイクルの形（2026-09-23 決定。共通の `WORKFLOW.md` より優先する）

**タスクの正典は `main` の `develop/tasks.json`** で、自分の作業ツリーのものではない。
`doing` を `main` に入れてから着手し、`main` へマージして `done` にするまでが1サイクル。

1. **ビハインドなら取り込む**: `git rev-list --count <枝>..main` が 0 でなければ `git merge main`
   （並行して動かしていると相手が先に `main` を進めていることがあり、そのときはここが
   merge commit になる。**`develop/progress.md` の衝突はマージドライバ
   （`scripts/merge-progress.ts`。登録は「## セットアップ / 環境構築」参照）が畳むので
   手が要らない。それ以外のファイルで衝突したら手を止めて預ける**）
2. **`main` から選ぶ**: `git show main:develop/tasks.json` を読み、`todo` かつ依存が済んだ1件を
   選ぶ（`doing` の行があれば取り残し。共通の手順2の扱いに従って止まる）
3. **`doing` を `main` に入れる**: その1行だけ `doing` に書き換えてコミットし、
   `git -C <本体> merge --ff-only <枝>` で `main` へ送る。**`--ff-only` が落ちたら手順1へ戻る**
   （自分以外が `main` を進めた合図。競合の検出はこれが兼ねる）
4. **作業する**
5. **`done` を `main` に入れる**: `status` / `passes` / `evidence` と `progress.md` を書いて
   コミットし、同じ `--ff-only` で `main` へ送る

**`doing` はコミットする。** 共通の `WORKFLOW.md`「この書き換えはコミットしない」は
このリポジトリでは効かない（理由は `docs/workflow.md`）。代わりに `main` 上のコミットが
1タスク2回になる。**fast-forward になるのは手順3・5の `--ff-only` で送るほう**——手順1で
取り込んでいれば枝は `main` の子孫なので、送るときは必ず追い付くだけで済む。**手順1自体
（`git merge main`）は fast-forward とは限らない**。並行して動かしていると相手が先に
`main` を進めていることがあり、そのときは手順1が merge commit を作り、それが手順3・5の
`--ff-only` でそのまま `main` に乗る（振り返りの範囲の40コミットのうち11件がこの形だった）。

- **`main` の作業ツリーで起こしたときは手順3・5のマージをしない**（すでに `main` に居るので、
  コミットがそのまま `main` に入る）
- **本体（`main` を出している作業ツリー）が clean でなければマージを始めない**
- **新しい作業ツリーの立ち上げは人がやる**（`bun install` と `bun run build`。
  `node_modules` と `dist/browser/` は `.gitignore` なので、切った直後は `bun run check` も
  `bun run start` も通らない。自動化はしない——2026-09-23 決定）

**作業ツリーが分かれていれば、2つのタスクを並行して進めてよい**（触る層が重なっていても
選んでよい。相手の足元のファイルは動かない）:

- **取り合いを防ぐのは `main` の `doing`。** 手順3で `main` に入るので、別の作業ツリーからも
  手順2で見える。作業ツリーの中だけの `doing` は取り合いを防がない
- **検証コマンドは並行して打ってよい**（自分の作業ツリーで走るので、相手の作業中の変更を
  拾わない）。**ただしポートは作業ツリーで分かれない。** `bun run check` に含まれる
  `test/cli.test.ts`「既定ポートから上限まで全部塞がっていると…終了コード1で終わる」は
  ポート範囲を専有して確かめるテストなので、並行して打つと時間切れになることがある
  （テスト側をポートの取り合いに左右されなくする直しは別のタスクで扱う。それまでは
  時間切れになったら打ち直す）
- **tsukumo を起こす目視確認が要るタスクを並行させるなら、`TSUKUMO_VIEW_PORT` と `TSUKUMO_HOME` を
  2つとも分ける。** ポートだけ分けてもホーム（`~/.tsukumo/` の `state.json`・雑談の要約と
  アーカイブ・トークンの記録）は共有されたままで、とくに雑談の要約は全上書きなので後に書いた
  ほうが相手のものを丸ごと消す。分けたホームに覚えたキャラクターは本体のホームへは戻らない
- `develop/tasks.json` も自分のブランチで書き換える。合流のときに同じ行がぶつかりうるので、
  **着手したタスクの行だけを触る**（`tasks.json` を整形し直さない）

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
