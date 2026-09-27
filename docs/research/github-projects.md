# タスク管理を GitHub Projects へ移すか（2026-09-27）

**この文書は調査メモであって正典ではない。** `docs/` の他ファイルにある「節の索引」はここには
作らない。タスクの管理（`develop/task/` の1件1ファイルと git の外の台帳）を GitHub Projects
（と Issues）へ移すべきかという、ユーザーからの指示（2026-09-27）の検討と、その決定の記録。
**GitHub に Project・Issue を作る・書き込む操作はしていない。**

## 結論

**移す（2026-09-27 ユーザー決定）。** 本文は公開リポジトリの Issue に置き、Project で状態と
欄を持ち、着手の印は Issue に紐づく枝の作成で取る。

- 移す理由は、読み手に分かりやすいこと。自作の `task` コマンドと git の外の台帳（`mkdir` の印）は
  このリポジトリの外の人には読めない。Issue・Project・紐づく枝は GitHub の標準の約束で、誰でも読める
- 最初の検討は「移さない」だった（下の「最初の判定と、覆った理由」）。オフライン・認証・外への送信を
  損と数えていたが、どれもユーザーの判断で損でなくなった
- 状態名の改名（`hold` → `pending`・`dropped` → `cancel`）は、Project の Status 欄の選択肢の設計に畳む

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

| Issue 同士の依存（blocked by）は REST で読み書きできる: `GET`・`POST /repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocked_by`、`DELETE …/blocked_by/{issue_id}`、`GET …/dependencies/blocking` | https://docs.github.com/en/rest/issues/issue-dependencies |
| Issue と IssueComment は GraphQL の `userContentEdits`（本文の編集の一覧）を持つ | https://docs.github.com/en/graphql/reference/issues |

## 解くべき論点

### 1. 着手の印を原子的に取れるか

**結論: Project の欄・assignee・label では取れない。Issue に紐づく枝の作成で取る（ユーザー決定）。**

- Project の Status 欄・assignee・label は、前提条件（期待する前の値・`If-Match`）を受け付けず、
  後に書いたほうが勝つ（上の表）。2つの作業ツリーが同時に「着手」を書けば、両方が自分が取ったと読む
- 原子的なのは git の参照の作成だけ（既にあれば失敗する）。「Issue に紐づく枝がある＝着手中」は
  GitHub の画面（Issue の Development 欄）にも出る標準の約束なので、錠をこれに置く
- CLAUDE.md の「自分でブランチを切らない」は、この運用に合わせて改める（ユーザー決定）
- **確かめていないこと**: `gh issue develop`（GraphQL `createLinkedBranch`）が、既にある枝の名前を
  渡されたときに失敗するか。失敗しないなら、枝の作成を REST の参照の作成（既存なら `422`）で
  行ってから Issue に紐づける。移行の最初のタスクで、GitHub 上で1回試して決める

### 2. `/loop /next-task` の無人運転・オフライン・`gh` の認証・回数制限

**結論: どれも移す妨げにならない。**

- **オフライン**: Claude も同じく止まるので、差は無い（ユーザーの判断）
- **認証**: `gh auth login` と `project` スコープを人が一度通す。失効すると `/loop` が止まるので、
  `task status` 相当の入口で認証の失敗を先頭語にして止める
- **回数制限**: 1サイクルで読み数回・書き数回。6本の作業ツリーが並んでも 5,000回/時・書き 80回/分には
  届かない。書き込みは直列にし、二次制限に当たったときの再試行を持つ

### 3. タスクの本文をどこに置くか

**結論: 公開リポジトリの Issue。登録時の節は本文、着手時と完了時の節はコメントとして積む。**

**本文の節の置き先**

| 節                                         | 置き先                     | 書き方                                  |
| ------------------------------------------ | -------------------------- | --------------------------------------- |
| 目的・完了条件・背景・解くべき論点・注意   | Issue の本文               | 登録時に書く                            |
| 決まっていること（`pending` で決めたこと） | Issue の本文               | 書き換える（`userContentEdits` に残る） |
| やること（着手直後の調べ直し）             | コメント                   | 書き足す                                |
| 結果・振り返り                             | 閉じるときのコメント       | 書き足す                                |
| `difficulty`・`loopable`                   | Project の単一選択の欄     | 登録時に置く                            |
| 依存                                       | Issue の依存（blocked by） | 登録時に置く                            |

**今の読み手と、移したあとの読み方**

| 読み手                                                      | 今読んでいるもの                                                   | 移したあと                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| コミットとタスクの対応                                      | 件名の `T-xxx:` と、同じコミットに入る `## 結果`                   | コミットに Issue 番号を書き、GitHub が自動でつなぐ。結果はコミットの外（コメント）へ移る       |
| `retrospect` の `material.py`                               | 登録時の版と完了時の版のタスクファイルの差                         | コメントの並びがそのまま差になる。本文の書き換えは `userContentEdits`                          |
| `retrospect` の `scan.py`                                   | `## 結果` の `- 振り返り:` の行                                    | 結果のコメントの同じ行                                                                         |
| タスク板（`src/server/repository/adapter/task-summary.ts`） | `main` のファイルと台帳を見張る                                    | API で問い合わせるよう作り直すか、Orca のタブで Project のボードを開くことにしてタスク板を消す |
| 成果（`src/server/achievement/`）                           | `git log` でタスクファイルの出入りを読み、運用だけのコミットを除く | Issue の閉じた時刻を読む。運用だけのコミットが無くなるので、除く処理が要らなくなる             |
| 過去の判断を探す                                            | リポジトリの中を `grep`                                            | `gh search issues`。手元で `grep` できなくなるのが、本文を移して失う実害                       |

- 旧形式の `docs/history/tasks.md` と、git に残る過去の `develop/task/` は動かさない。成果は移行の日を
  境に、前を git、後を Issue から読む
- 採番は Issue 番号（PR と同じ連番）になる。`T-xxx` とは合わないので、移す未完了のタスクは
  Issue の題に旧 ID を添える

### 4. 外部サービスへの公開になる範囲

**結論: GitHub Projects（と同じリポジトリの Issue）の範囲で、エージェントが書いてよい（ユーザー決定）。**

- `sinnlosses/tsukumo` は公開リポジトリなので、本文は書いた時点で公開される（今は push した時点）。
  読める人の範囲は変わらない
- CLAUDE.md の「外部への公開・送信は人の承認を得てから」に、GitHub Projects とこのリポジトリの
  Issue への書き込みを例外として足す
- 会話内容の扱い（`docs/coding-standards.md`「会話内容の扱い」）は SDK のイベントと transcript が
  対象で、タスク本文には直接かからない。ただし本文・コメントに会話の断片を写すと即座に公開される
  ので、「タスク本文に会話を写さない」を運用の規則に書く

## 移行の段取り

1. **人がやること**: `gh auth login` と `gh auth refresh -s project`。Project を1つ作る
2. **運用の設計を決めて正典に書く**: Project の欄（Status の選択肢は `todo`・`pending`・`done`・
   `cancel`。着手中は紐づく枝で表し、Status には書かない）、紐づく枝の名前の規則と取り残しの判定、
   `gh issue develop` の既存名での挙動の確認、CLAUDE.md の「自分でブランチを切らない」と外への送信の
   例外の改訂
3. **スキルを作り直す**（claude-skills を別の作業ツリーで。`~/.claude/skills` は本体の作業ツリーへの
   symlink）: `task-workflow`（`WORKFLOW.md`・`scripts/`）、`next-task`・`plan-tasks`・`list-tasks`・
   `retrospect`（`scan.py`・`material.py` の材料を Issue のコメントへ）・`setup-tasks`
4. **tsukumo の読み手を移す**: タスク板（作り直すか消すか）、成果（Issue の閉じた時刻）、
   `src/shared/task-summary.ts` の文法
5. **移す**: 全作業ツリーの手を止め、`develop/task/` の未完了を Issue へ移し（題に旧 ID）、
   `develop/task/` を消す。`docs/workflow.md` を追随させる

## 最初の判定と、覆った理由

最初の検討（同日）は「移さない」だった。着手の印はすでにコミットを積まずに取れていて（台帳の
`mkdir`）、指示の動機が満たされていると読んだため。損と数えた4点のうち、読み手に分かりやすいこと
（数えていなかった）・オフライン（Claude も止まるので同じ）・認証（通せばよい）・外への送信
（GitHub Projects の範囲で許す）が、ユーザーの判断で覆った。原子的な着手の印が Project の欄で
取れないことは変わらず、紐づく枝で解く。
