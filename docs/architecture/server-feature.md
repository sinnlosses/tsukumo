# アーキテクチャ詳細: サーバの機能と、機能どうしの辺

ステータス: **正典**。入口は `docs/architecture.md`（全体構造の入口と、子のファイルの一覧）。

責務: `src/server/` を割る機能の一覧と、どの機能にも属さない共有の箱、機能どうしの import の規則と辺の表を持つ。
読む時: サーバに機能を足すとき、機能どうしの import が許されるかを確かめたいとき。
直す時: 機能を足す・消すとき、機能どうしの辺を変えたとき（辺の規則は `.dependency-cruiser.cjs` が持ち、表は `pnpm run format` が書き直す）。

## 全体構成

### サーバの機能と、機能どうしの辺

`src/server/` は**機能のまとまりで割り、機能の中を層（`core/` と `adapter/`）で割る**。機能の名前は
`docs/glossary.md` の語（単数形）で、**1つの機能 = 1つのディレクトリ**。機能の中は `core/`（判断）と
`adapter/`（境界）の2段だけで、中身の無い段は作らない。機能の中のファイルは
`ls src/server/<機能>/core/ src/server/<機能>/adapter/` が正典で、各ファイルの持ち物はそのファイルの
冒頭のコメント（「core と adapter」）。

| 機能                 | 何の機能か                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `session/`           | セッションを持つ・起こす・頼む。**各機能の判断を束ねる**（下の「束ねる機能」）                                          |
| `session-driver/`    | セッションドライバ。契約・SDK の実装・fake driver・メッセージの変換・答え待ち・続きから始める・セッションの占有ファイル |
| `report/`            | レポートの記法・`report` ツール・検査と差し戻し・塊の使われ方の記録・部品の文法カード                                   |
| `work-plan/`         | ワークプラン。`work_plan`・`phase_result` の説明と判断・差し戻し・委譲ゲート・帯の位置の文                              |
| `question/`          | 質問。`question_brief` の添え書きの検査と `AskUserQuestion` との突き合わせ・質問の書き方の規約                          |
| `system-prompt/`     | `systemPrompt` の append の組み立てと、セリフの間合いの規約                                                             |
| `chat/`              | 雑談モード。作法・記憶・話しかけ・アーカイブ・要約・覚えたこと・定着                                                    |
| `character-pack/`    | キャラクターパックの選択・読み込み・画面からの編集・立ち絵からの生成（使い捨ての `query()`）                            |
| `diary/`             | 日記。`diary` ツールと保存                                                                                              |
| `achievement/`       | 成果。終えたタスクを Beads の閉じた課題から数える                                                                       |
| `usage-review/`      | 見直し。見直しと提案の実行の走り（使い捨ての `query()`）・2つのツール・前回の結果・見送り                               |
| `token-usage/`       | トークン消費の記録と集計                                                                                                |
| `context-usage/`     | コンテキストの内訳の記録                                                                                                |
| `plan-usage/`        | プラン使用量（`/usage` と同じ上限）の手続き                                                                             |
| `experience-metric/` | 進行の計測値の記録と集計                                                                                                |
| `diagnostic/`        | 診断ログ（不具合の経緯を追う足跡）の書き口・束ね・置き場と掃除                                                          |
| `host/`              | ホストのポートと Orca・`none` の実装、ホストへ渡す前の門番                                                              |
| `view-server/`       | ビューサーバ。ポートの決定・http・ws・同梱の外部ライブラリ・ブラウザ側の組み立てと開発サーバ                            |
| `repository/`        | 作業ディレクトリの git リポジトリを読む。`git` を起こす口・管理下のファイルと行の抜き書き・タスク一覧                   |
| `recommendation/`    | おすすめの札。候補・出力の検査・キャッシュ                                                                              |
| `welcome-greeting/`  | 迎えの挨拶と反応。書き手・覚え・使い捨ての問い合わせの指示文と検査                                                      |
| `checkout/`          | 打った場所のチェックアウトと自分の根を比べ、違えば打った側の `bin/tsukumo` へ委ねる                                     |
| `workflow-setting/`  | ワークフローの設定。`tw` の設定コマンドを起こす口と読み書きの手続き                                                     |
| `item/`              | キャラビューの席に置くアイテム。一覧と席の置き場の読み書き・素材を配る判断                                              |

**どの機能にも属さない共有のもの**は、`server/core/` と `server/adapter/` の**直下**に置く
（いまあるものは `ls src/server/core/ src/server/adapter/`）。置いてよいのは**どの機能の語彙も名乗らず、読み手が
2つ以上ある（機能・共有の箱・配線のどれでも数える）もの**だけで、読み手が1つの機能だけに
なったらその機能へ下ろす（`browser/domain/` と同じ引き金）。

**機能どうしの import の規則**:

- **層の規則が先に効く。** `core/` は、どの機能のものでも `adapter/` を import しない
- **機能 A が機能 B を import してよいのは、下の表にある組だけ。** 共有の箱はどの機能からも
  読んでよく、**共有の箱は機能を読まない**
- **層ごとに循環させない。** 機能の `core/` どうしの辺と、機能の `adapter/` どうしの辺は、それぞれ
  一方通行（表はその順に並ぶ）。機能の単位で見ると輪が1つある
  （`view-server` → `session` → `session-driver` → `view-server`）が、1本が
  `adapter → 別の機能の core` で層の辺と同じ向きなので、ファイルの単位では輪にならない
- **束ねる機能は `session/` の1つ。** `session-manager.ts` は外の世界に触らないので `core` だが、
  各機能の判断（日記・トークン消費・会話のアーカイブ）を読んで1つのセッションに
  まとめる。**外の世界の実装を選んで渡すのは配線（`src/` 直下の `session-start.ts` と `src/wiring/`）**、
  渡されたものを使って順序と状態を持つのが `session/`、という境目
- **セッションの配線は機能ごとに組み立てる。** `src/wiring/<機能>.ts` の `wire<機能>` が、その機能の
  「`createSessionManager` へ渡す口」（`manager`）と「`createSocketRouter` へ渡す口」（`commands`、
  `session` の口の一部なら `sessionCommands`）を返し、`startSession` はそれを spread で結ぶだけにする。
  `/rpc` の読み口を持つ機能は `rpc` も返し、`src/view-delivery.ts` はそれを spread で結ぶだけにする
  （セッションが繋がってから本物になる読み口だけは、配信が「取れない」から差し替える形で持つ）。
  `WiringContext` は `src/main.ts` が作り、`startViewDelivery` と `startSession` の両側の組み立てに渡す。
  機能を足すときに触るのは、その機能の組み立てと、結ぶ行だけ。口の揃いは結ぶ側の型検査が見る。
  2つ以上の組み立てが読む値（作業先・時計・引き継ぐ環境・疑似セッション・会話のアーカイブ）だけを
  `WiringContext`（`src/wiring/wiring-context.ts`）にまとめて渡し、1つの組み立てしか
  読まないもの（成果の入れ物・`.beads` の印の読み手など）はその組み立ての引数に渡す。
  各欄が2つ以上の `src/wiring/*.ts` から読まれることは `test/architecture/wiring-context.test.ts` が見る。組み立てどうしの受け渡しは口で渡す（起こす組み立てが代を起こすたびに
  日記の組み立ての `noteLaunched` を呼ぶ）。`createSessionManager` の引数を機能ごとの束に変える案は
  採らない（`session-manager.ts` は割らない。`docs/architecture/adr/0021-feature-state-fold-in-feature.md`）。
  配線には単体テストを持たない（守る振る舞いは E2E が本物のプロセスで、口の揃いは型検査が守り、
  単体で書くには adapter を差し替える本番に要らない口が要る）
- **Agent SDK を import してよいのは、機能の `adapter/` の直下の `sdk-` で始まるファイルだけ**
  （原則3）。1つの箱にはまとめず、**その境界が属する機能に置く**（「core と adapter」）。
  例外は共有の箱の `server/adapter/` 直下の `sdk-` で始まる、どの機能の語彙も名乗らない使い捨ての問い合わせの口
- **機能を足すときは、`test/architecture/feature-graph.ts` の機能の一覧と `.dependency-cruiser.cjs` の
  機能の規則に足す**（知らない機能のディレクトリと、`core/` `adapter/` の外に置いたファイルは
  `test/architecture/server-feature.test.ts` が、規則の足し忘れは `test/architecture/dependency-rule.test.ts` が落とす）。
  下の表は規則から書き直される

#### 機能どうしの辺の表

<!-- feature-edge-table:start -->

| 機能（import する側） | 読んでよい機能                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `session`             | `session-driver` `chat` `diary` `token-usage` `context-usage` `experience-metric` `diagnostic` `character-pack` `report`                                                                                           |
| `system-prompt`       | `session-driver` `chat` `report` `work-plan` `question`                                                                                                                                                            |
| `view-server`         | `session`                                                                                                                                                                                                          |
| `chat`                | `character-pack`                                                                                                                                                                                                   |
| `context-usage`       | `session-driver`                                                                                                                                                                                                   |
| `session-driver`      | `report` `view-server` `chat` `work-plan` `question`                                                                                                                                                               |
| `diary`               | `repository`                                                                                                                                                                                                       |
| `usage-review`        | `session-driver`                                                                                                                                                                                                   |
| `achievement`         | `repository`                                                                                                                                                                                                       |
| そのほか              | —（葉。`plan-usage` `experience-metric` `diagnostic` `character-pack` `host` `repository` `recommendation` `checkout` `welcome-greeting` `workflow-setting` `report` `item` `token-usage` `work-plan` `question`） |

<!-- feature-edge-table:end -->

表は `.dependency-cruiser.cjs` の `server-feature-edge:` の規則から `pnpm run format` が書き直す。使われない組を落とす検査は持たない（`docs/architecture/adr/0037-dependency-cruiser-edge-check.md`）。
辺が `core` と `adapter` のどちらからどちらへ向かうかは表に持たず、実際の import が正典。
