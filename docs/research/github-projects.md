# タスク管理を GitHub Projects へ移すか（2026-09-27）

**この文書は調査メモであって正典ではない。** `docs/` の他ファイルにある「節の索引」はここには
作らない。タスクの管理（`develop/task/` の1件1ファイルと git の外の台帳）を GitHub Projects
（と Issues）へ移すべきかという、ユーザーからの指示（2026-09-27、「コミットを積まずに排他制御が
できそう?」）の記録。**GitHub に Project・Issue を作る・書き込む操作はしていない**（提案だけ）。

## 結論

**移さない。** 理由は3つ:

1. **着手の排他制御は、今すでにコミットを積まずにできている。** `task claim` は全作業ツリーが
   共有する `.git` の下の台帳に `mkdir claim/T-xxx` で印を立てる（`mkdir` の成否が取り合いの判定）。
   `main` は動かない。指示が期待した利点は、移さなくても手元にある
2. **GitHub Projects・Issues には、着手の印を原子的に取る仕組みが無い。** 項目の欄・assignee・
   label の更新はどれも前提条件（期待する前の値・版・`If-Match`）を受け付けず、後に書いたほうが
   勝つ。しかも全作業ツリーが同じ GitHub アカウントで動くので、assignee では誰が取ったかを
   区別できない。GitHub で原子的なのは git の参照の作成・比較付き更新だけで、それは今の
   台帳（`mkdir`）を遠くに置き直すだけになる
3. **移すと失うものが多い。** タスク板と成果（tsukumo 自身が `main` の `develop/task/*.md` を
   読む）、`retrospect` の材料（登録から完了までのタスクファイルの差分）、オフラインでの動作、
   `/loop` の無人運転の安定、人が push する前にエージェントが外へ書かないという線

移して減るのは、タスクIDを持たないコミット（登録と剪定。2026-09-20 以降の `main` で 92件）で、
失うものに見合わない。後段の状態名の改名（`hold` → `pending`・`dropped` → `cancel`）は、今の `develop/task/` の運用のまま進める。

## 今の運用の前提（実測、2026-09-27・main a2338ed1）

- 正典は `~/.claude/skills/task-workflow/WORKFLOW.md`（claude-skills のリポジトリ）。設計の経緯は
  claude-skills の `docs/task-workflow-redesign.md`（4.2「台帳」・11「採らなかった案」）
- 台帳は `$(git rev-parse --git-common-dir)/task-workflow/` に `claim/T-xxx/owner`・`lock/`（採番の錠）・
  `last-id`。`claim` と `lock` の取り合いは `mkdir` の成否だけで決める（`scripts/ledger.py` の
  `claim_dir`）。コミットしない
- タスクファイルの `status`（`todo`・`hold`・`done`・`dropped`）は git に載り、完了は作業と同じ
  1コミットで `task ship` が `main` へ ff で送る
- 2026-09-20 以降の `main`（merge を除く）は 1214コミット。うち `develop/task/` を触ったのが 283件、
  タスクIDを件名に持たないものが 92件（「指示をタスクにする」51件・「振り返り済みのタスクファイルを
  消す」36件ほか）
- tsukumo の読み手: `src/server/repository/adapter/task-summary.ts`（`main` の `develop/task/*.md` と
  台帳の印を見張り、サイドバーのタスク板へ流す）、`src/server/achievement/`（`git log` で
  `develop/task/` の出入りを読み成果を数える）、`src/browser/features/task-board/`
- `gh` 2.101.0 はこの端末で未ログイン。`sinnlosses/tsukumo` と `sinnlosses/claude-skills` は
  GitHub で公開（未認証の `GET /repos/...` が 200）。`develop/task/` は `origin/main` にも載っている

## GitHub の API で確かめたこと（一次情報）

| 事実                                                                                                                                                                                                                                                                             | 出典                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| REST の条件付きリクエストは `If-None-Match`・`If-Modified-Since` による読み取り用。「`POST`・`PUT`・`PATCH`・`DELETE` のような unsafe なメソッドの条件付きリクエストは、別に記載が無い限り対応しない」。`304` は一次の回数制限に数えない                                         | https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api                                       |
| `updateProjectV2ItemFieldValue` の入力は `projectId`・`itemId`・`fieldId`・`value`・`clientMutationId` だけで、期待する前の値や版の欄は無い。`ProjectV2Item` には `updatedAt` がある（読んでから書くまでの間は守れない）                                                         | https://docs.github.com/en/graphql/reference/projects                                                                          |
| Projects の REST（`PATCH /users/{username}/projectsV2/{project_number}/items/{item_id}`）も `fields` の `id`・`value` を渡すだけで、前提条件の記載は無い                                                                                                                         | https://docs.github.com/en/rest/projects/items                                                                                 |
| 項目の追加と欄の更新は1回の呼び出しでできない（`addProjectV2ItemById` のあと `updateProjectV2ItemFieldValue`）。トークンは `project` スコープ（読むだけなら `read:project`）                                                                                                     | https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects |
| assignee の追加は「既に割り当てられた人は置き換えない」追記（最大10人）。前提条件は無い                                                                                                                                                                                          | https://docs.github.com/en/rest/issues/assignees                                                                               |
| git の参照は原子的に扱える: GraphQL の `updateRefs` は `RefUpdate.beforeOid`（「更新の前にこの値を指していなければならない」）を持ち、「1つでも拒まれれば他の参照も変えない」。REST の参照の作成は `201`／`409 Conflict`／`422`、更新は `force` を省けば fast-forward 以外を拒む | https://docs.github.com/en/graphql/reference/git ・ https://docs.github.com/en/rest/git/refs                                   |
| 回数制限（REST）: 認証したユーザーは 5,000回/時。二次制限は同時 100、900点/分、CPU 90秒/60秒、内容を作る要求は 80回/分・500回/時。書き込みを続けるときは1秒以上あけ、並行でなく直列に打つ                                                                                        | https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api ・ best-practices（上）                        |
| 回数制限（GraphQL）: 5,000点/時。二次制限の計算で mutation は1回5点、2,000点/分、同時 100（REST と合わせて）                                                                                                                                                                     | https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api                                   |
| `gh project` の最小スコープは `project`。`gh auth refresh -s project` で足す                                                                                                                                                                                                     | https://cli.github.com/manual/gh_project                                                                                       |

## 解くべき論点

### 1. 着手の印を原子的に取れるか

**結論: Projects・Issues の機能では取れない。取れるのは git の参照だけで、それは今の台帳と同じ形。**

- Projects の Status 欄（単一選択）・assignee・label は、どれも「書いた」が必ず成功し、後に書いた
  ほうが残る（前提条件の欄も `If-Match` も無い。上の表）。2つの作業ツリーが同時に「着手」を
  書けば両方が成功し、どちらも自分が取ったと読む
- 「書いてから読み直し、先に書いたほうを勝ちとする」（例: Issue にコメントを付け、最も古い
  コメントの主を勝ちとする）は組めるが、読み直すまでのあいだ両方が作業を始めうる。
  しかも全作業ツリーが同じアカウントなので、主を作業ツリー名で書き分ける取り決めが要る。
  CLAUDE.md「機械的な仕組みをヒューリスティックより優先する」に反する
- 原子的に取れるのは git の参照: `refs/claims/T-xxx` を「無ければ作る」（REST の作成が既存なら
  失敗する、GraphQL の `updateRefs` の `beforeOid`）。これは claude-skills の設計書 11章で
  「`refs/task-claims/*` に置く案」として既に退けた形を、手元の `.git` から GitHub へ遠くしただけで、
  得るのは「別のクローン・別のマシンとも取り合える」ことだけ。対象ユーザーは1人・1クローン
  （同 4.2）なので効かない

### 2. `/loop /next-task` の無人運転・オフライン・`gh` の認証・回数制限

**結論: どれも今より悪くなる。回数制限だけは実害が出にくい。**

- **オフライン**: 今は `status`・`claim`・`done`・`ship` がすべて手元の git だけで動く。移すと
  一覧・着手・完了のたびにネットワークが要り、GitHub の障害でも止まる。`/loop` は止まった
  サイクルを「続行不要」と扱うので、夜間の無人運転が黙って止まる経路が増える
- **認証**: この端末の `gh` は未ログイン。移すには `gh auth login` と `project` スコープの追加が要り、
  CLAUDE.md の「認証情報や権限の変更」に当たるので人の承認が要る。トークンが失効すると `/loop` の
  全サイクルが止まる。`gh` は `orca` 以外の外部コマンド依存の追加にも当たる（CLAUDE.md
  「セットアップ / 環境構築」）
- **回数制限**: 1サイクルで読み（一覧・本文）数回、書き（着手・完了・結果）数回。6本の作業ツリーが
  並んでも 5,000回/時・書き 80回/分には届かない。ただし「書き込みは直列に、1秒あけて」の推奨に
  従う待ちと、二次制限に当たったときの再試行を `task` が持つ必要がある
- **原子性の欠落の影響**: 論点1のとおり、並行する作業ツリーが同じタスクを取る事故を防げない
  （今は起きない）

### 3. タスクの本文をどこに置くか

**結論: 移すなら Issue の本文になるが、git の履歴に残らなくなる損が大きい。**

- 得: 本文の登録・編集が `main` のコミットにならない（登録 51件/週のコミットが消える）。
  GitHub の画面で読める
- 損:
  - `task done` の `## 結果` が作業のコミットと同じ版に乗らなくなる。どのコミットがどの完了条件で
    受け入れられたかを `git log` で引けなくなる
  - `retrospect` の `scan.py` は登録時から完了時までのタスクファイルの差分（着手直後に書き足した
    `## やること` を含む）を git から読む。Issue の編集履歴を API で取り直す作り直しが要る
  - tsukumo のタスク板（`task-summary.ts`）と成果（`src/server/achievement/`）が `main` の
    `develop/task/` を読んでいる。読み元を GitHub に替えると、tsukumo がネットワークへ出る経路を
    新たに作ることになる（`docs/coding-standards.md`「会話内容の扱い」の「tsukumo 自身が
    ネットワークへ出る経路を足さない」の線に近づく。タスク本文は会話そのものではないが、
    ビューが `127.0.0.1` の外へ問い合わせを始める）
  - タスクIDの連番（`T-` + 3桁以上、`docs/history/tasks.md` との連続）と Issue 番号（PR と共有の
    連番）が合わず、対応表か本文の中の ID が要る
  - 振り返りのための `develop/task/` の剪定（`task prune`）は不要になるが、その代わり Issue の
    close・Project からの archive の規則を別に決め直す

### 4. 外部サービスへの公開になる範囲

**結論: 公開の範囲そのものは今と大きく変わらないが、「エージェントが自分で外へ書く」線を越える。**

- `sinnlosses/tsukumo` は公開リポジトリで、`develop/task/` と `docs/history/direction.md`（ユーザーの
  生の言い回し）は push した時点で既に公開されている。Issue に置いても、読める人の範囲は同じ
- 変わるのは経路: 今は外へ出るのは人が頼んだ push だけ（CLAUDE.md「push は頼まれたときだけ」）。
  移すと `/loop` のエージェントがサイクルごとに GitHub へ書く。CLAUDE.md の IMPORTANT
  「外部への公開・送信は人の承認を得てから」を、運用の仕組みとして常時破ることになる
- 非公開の Project にしても、項目の元の Issue が公開リポジトリにあれば Issue は公開のまま。
  本文を非公開にするには Draft issue（Project の中だけの項目）か非公開のリポジトリが要る
- 会話内容の扱い（`docs/coding-standards.md`「会話内容の扱い」）: タスク本文は会話そのものでは
  なく、この規約は tsukumo のプロセスが扱う SDK のイベントと transcript が対象なので、直接は
  触れない。ただし本文や `## 結果` に会話の断片を書き写すと、今は「人が push するまで手元」だった
  ものが即座に外へ出る。移すなら「タスク本文に会話を写さない」を `task` の検査で守る必要がある

## 推奨

**移さない。** `develop/task/` の1件1ファイルと git の外の台帳を続ける。

- 指示の動機（コミットを積まずに排他制御）は今の台帳で満たされている。これを `docs/workflow.md` か
  WORKFLOW.md に書き足す必要は無い（WORKFLOW.md「ファイル配置と設定ファイル（AGENTS.md → CLAUDE.md の順）」の台帳の行が既に言っている）
- 残るタスクIDの無いコミット（登録・剪定）を減らしたいという別の動機があるなら、GitHub へ移す
  のではなく、今の運用の中で「登録のコミットを次のタスクのコミットへ畳む」「剪定の閾値を上げる」
  などを別に検討する（この文書では提案しない。指示が来たらタスクにする）
- 見直す条件: 複数のマシン・複数の人でタスクを取り合うようになったとき（台帳がクローンごとに別に
  なる前提が崩れる）。そのときも Projects の欄ではなく、git の参照の作成（`refs/claims/T-xxx`、
  GitHub 側で原子的）を排他の錠にし、Projects は見るための画面に留める形から考える

## 移すとした場合の段取り（参考）

推奨は「移さない」だが、見直す条件に当たったときの出発点として残す。

1. ユーザーの承認: `gh auth login` と `project` スコープ（認証情報の変更）、エージェントが GitHub へ
   書くこと（外部への送信）、`gh` という外部コマンド依存の追加
2. 排他の錠を決める: Projects の Status 欄は表示用とし、着手の印は GitHub の git の参照
   `refs/claims/T-xxx` の作成（既存なら失敗）で取る。取り残しの判定（claude-skills の設計書 4.3）を
   参照の作成時刻と作業ツリー名で作り直す
3. claude-skills を別の作業ツリーで直す（`~/.claude/skills` は本体の作業ツリーへの symlink）:
   `task-workflow/scripts/`（`ledger.py`・`taskfile.py`・`task.py` の `status`・`new`・`claim`・
   `done`・`ship`・`prune`、`selftest_task.py`）、`WORKFLOW.md`（置き場・文法・状態の遷移・
   終了コードにネットワーク障害と二次制限を足す）、`next-task`・`plan-tasks`・`list-tasks`・
   `retrospect`（`scan.py` の材料を Issue の編集履歴へ）・`setup-tasks`（Project の作成と欄の用意）
4. 状態の設計: Project の単一選択の欄に `todo`・`hold`・`done`・`dropped` を置く（状態名の改名は
   この欄の選択肢の名前として畳む）
5. tsukumo 側: `src/server/repository/adapter/task-summary.ts` と `src/server/achievement/` の読み元、
   `src/shared/task-summary.ts` の文法、タスク板。ネットワークへ出る経路を足すのでユーザーの決定が要る
6. 移行: 全作業ツリーの手を止め、`develop/task/` の未完了を Issue へ移し、完了分は git に残す。
   `task` を GitHub 版に切り替えてから `develop/task/` の未完了を消す
