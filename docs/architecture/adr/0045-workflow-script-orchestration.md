# タスクの段の進め方を、plugin の dynamic workflows の台本に移す（2026-11-01）

ステータス: 採用

**`/next-task` が着手の印を立てたあとの段の進め方（実装 → 受け入れ → 振り返り）を、`tsukumo-plugins` の `workflows/` に置く台本1本 `task-flow` に移す。**
置き場（Beads）・着手の排他（`tw claim`）・送り出し（`tw finish`・`tw ship`）・関門の hook はメインと `tw` に残す。
tsukumo の契約は口（`work_plan`・`report`・`phase_result`）を残し、台本の完了でも委譲ゲートを立てることと、`phase_result` に段のまとめを持たせることだけを書き換える。
旧い流れ（`task-workflow` と並びの段のスキル）は並走させ、観察の基準を満たしたら消す。

材料は `docs/research/agent-harness-adoption-2026-11-01.md`（以下「調査メモ」）と、実機の確かめ `docs/research/workflow-script-trial.md`（以下「試作の記録」）。方向（dynamic workflows をオーケストレーターに据え、置き場・排他・送り出し・関門は残す）は 2026-11-01 に利用者が了承した。

## 何が困っていたか

- 段の進め方と差し戻しの回し方を、オーケストレーターのスキル（`task-workflow` の `SKILL.md` と `flows/`・`parts/`、Markdown 約 976 行）が文章で指示している。守られないところは hook（`tw handback-guard`）と `tw` の検査で止めており、1サイクルでメインが読む手順の文書は約 92KB ある
- 委譲・返却・申し送り・計測のために、委譲だけで使う `tw` のサブコマンドが約 1,171 行（`tw` の Python の約 10%）ある
- ループと分岐がモデルの読み取りに任されているので、段の飛ばし・差し戻しの回数の数え違い・`work_plan` の渡し忘れが、そのたびに hook の拒否と差し戻しで直される

## 前提の裏取り

| 前提                                                                  | 確かめた場所                                                           | 結果                                                                                                                                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 台本の agent に `PreToolUse` の hook が掛かる                         | 試作の記録「結果」                                                     | 掛かる。`tw commit-guard` が `git commit` を拒み、比べた回では `bash-guard` も拒んだ                                                                                 |
| 台本の agent の起動で `tw lap-hook` が `delegate` の start を書く     | 試作の記録「結果」                                                     | `agentType` の最後の `:` より後ろが `no-delegate` か `general-purpose` のときだけ書く（既定の型では書かない。`tw/lap_hook.py` の `IMPLEMENTER_TYPES`）               |
| 台本の agent に `SubagentStop` の hook（`tw handback-guard`）が掛かる | 試作の記録「未確認」                                                   | 確かめていない                                                                                                                                                       |
| 台本の agent から `phase_result` を呼べる                             | 試作の記録「結果」                                                     | `ToolSearch` で引けば呼べる。`delegatedRange` を渡してあれば帯が段ごとに進む                                                                                         |
| 台本の agent から `speak` を呼べる                                    | 試作の記録「結果」                                                     | 呼べる。直前の `speak` から新しい事実が無いと差し戻される                                                                                                            |
| 台本の完了通知で委譲ゲートが立つ                                      | 試作の記録「結果」                                                     | 立たない。`Agent` の返却（`SubagentHandback`）のあとは立つ                                                                                                           |
| tsukumo が SDK で起こしたセッションから `Workflow` を呼べる           | 試作の記録の3回（どれも tsukumo の仕事のセッションのメインから呼んだ） | 呼べる                                                                                                                                                               |
| 委譲先（サブエージェント）から `Workflow` を呼べる                    | 試作の記録「結果」                                                     | 呼べない（道具が無い）                                                                                                                                               |
| 保存済みの台本を名前で呼べる                                          | 試作の記録「結果」「未確認」                                           | 同じセッションの途中で足した `.claude/workflows/` の台本は名前で呼べず、`scriptPath` なら走った。plugin の `workflows/` と次のセッションでの読み込みは確かめていない |
| `isolation: 'worktree'` で未送信のコミットが見える                    | 試作の記録「結果」                                                     | 見えない（分岐元は `origin/main`）                                                                                                                                   |
| 台本版の所要とトークンが今の流れと同等以上                            | 試作の記録「台本版と今の流れの比べた結果」                             | 2件で、所要は基準線の 0.27〜0.55 倍、入力+出力+キャッシュ作成は 0.78〜0.88 倍。差し戻しは台本版が1回多い。台本版は検証と送り出しを含まない                           |
| SDK では使用量の上限で agent が一時停止せず失敗する                   | 調査メモ 2.1                                                           | 文書の記述。実機では当たっていない                                                                                                                                   |

移行の障害になる結果は無かった。確かめていない前提（`SubagentStop` の hook・plugin の `workflows/` の読み込み）は、台本を書く段の最初に確かめる（下の「置き換えの順」）。

## 決めたこと

### 1. 台本の置き場と並びの設定

- **台本は `tsukumo-plugins` の `workflows/task-flow.js` の1本。** `/tsukumo-workflow:task-flow` で呼ぶ。難しさ・近道・メインで行う、の分岐は台本の `args` と中の分岐で持ち、台本を分けない
- **並びの設定（`schema: 2` の `steps`）は欄の形を残し、値を台本の段の名前に替える。** 候補は `implement`・`accept`・`retrospect` で、`tw config --schema` が返す。台本は `args.steps` に含まれる段だけを走らせる（振り返りを外すと `retrospect` を飛ばす）。tsukumo は今までどおり `steps` を読まない
- 送り出しは台本の段にしない。台本はシェルに触れないので、完了通知を受けたメインが `tw finish` を打つ
- 並びの段の印（スキルの frontmatter の `workflow-step: "true"`）は、旧い流れを消すときに一緒に消す

### 2. 関門と計測

- **関門の hook は今のまま残す。** `PreToolUse` は台本の agent に掛かる（`tw commit-guard`・`bash-guard`）
- **台本の `agent()` はどれも `agentType` を指す。** 実装・直しは `tsukumo-workflow:no-delegate`、受け入れは `tsukumo-workflow:acceptor`、振り返りは新しく足す `tsukumo-workflow:retrospector`。既定の型のままだと `tw lap-hook` が `delegate` を書かず、受け入れ役の停止で `review` の end も書かない
- **不変条件: 同じ段は、どちらの流れでも台帳に同じ `lap` で残る。** 今の `tw lap-hook` は `no-delegate` の起動で `delegate` の start を書き、`retro` の start はメインの `Skill` の呼び出しでしか書かないので、振り返りを `no-delegate` で走らせると `delegate` が偽って開き、`retro` は書かれない。そこで:
  - 振り返りの agent の型を `retrospector`（`IMPLEMENTER_TYPES` に入れない）にし、`tw lap-hook` に「`retrospector` の `SubagentStart` → `retro` の start」を足す
  - 受け入れの段は、受け入れの頭の実装の agent が打つ `tw accept` が `accept` の start を書く。実装の agent は `tw accept` の判定の行を `schema` で返し、台本はそれで道を分ける
    - `REVIEW`（`SNAPSHOT` が出た）: 受け入れ役を起こし、通したら受け入れの締めの agent（`no-delegate`）を起こす。締めの agent が `tw accept T-xxx --after-review` を打って整形・`verify-check`・`accept` の end を済ませ、振り返りの agent はそのあとに起こす
    - `SKIP`・`NOTHING`・`NO_RANGE`: `tw accept` が整形・`verify-check`・`accept` の end まで済ませている。受け入れ役は今の流れと同じく目視と材料（`friction`・`human`）だけの依頼で起こし、締めの agent は起こさずに振り返りの agent へ進む。この道で `no-delegate` を起こすと、`accept` も `delegate` も閉じたあとなので `delegate` の start が偽って書かれる。受け入れ役は `IMPLEMENTER_TYPES` に無く、`review` も開いていないので、起こしても lap は書かれない
  - 締めの agent を挟むのは、`tw lap-hook` が `accept` の閉じていないうちは `retro` の start を書かないから（`lap_hook.py` の `_record`）。振り返りの agent に `--after-review` を打たせると、起動の時点で `accept` が開いていて `retro` の start が落ちる。この条件は変えない
  - `review` の end は、受け入れ役の `SubagentStop` で書く今の規則に頼る。`SubagentStop` が台本の agent に掛からないと分かったら、受け入れのあとに起きる agent（直しか締めの agent）が最初に `tw lap T-xxx review end` を打つ
- `tw handback-guard` の「計画・検証の欠けた返却を拒む」は、台本では `schema` の必須の欄に置き換える（実装の `schema` に、実行した検証コマンドとその結果を持たせる）。`SubagentStop` に掛かると確かめられたら、関門としても残す
- 台本の中は `Date.now()` が使えないので、所要は `tw lap-hook` の台帳と、完了通知の `duration_ms` で測る。段の控え（`tw step`）は実装の agent が段ごとに打つ

### 3. 帯

- **台本の agent が段ごとに `phase_result` を呼ぶ。** メインは台本を呼ぶ前に、`delegatedRange` つきの `work_plan` を渡しておく（範囲は実装の段の数。受け入れ・振り返りは範囲の後ろのメインの段のまま）
- **`phase_result` に、任意の欄 `summary`（段のまとめ1〜2文）を足す。** 台本のあいだメインは返却を受けないので、段ごとの中間レポートは agent が書くしかない。`summary` のある `phase_result` で済んだ段は、メインの `work_plan` の `phaseSummary` を要らなくする。ADR 0030 の「`phase_result` は要約を持たない」をこの点で改める
- **委譲ゲートを、台本の完了通知（`task_notification` の `local_workflow`）でも立てる。** 完了のあと、メインが帯の位置を確かめて `work_plan` を渡すまで作業の道具を拒む。返却を受けたら位置を確かめる、という今の決まりを台本でも保つ
- 受け入れ・振り返りの段は、台本の中で走るが、帯ではメインの段のまま。台本が `schema` で返した判定を読んで、メインが完了通知のあとに `work_plan` で進める

### 4. 残す・消す・書き換える

`tsukumo-plugins`（パスは plugin の根から）:

| 対象                                                                                                                                       | 扱い                                                                                                                                                                      | いつ             |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `skills/task-workflow/`（`SKILL.md`・`flows/`・`parts/`、`scripts/`）                                                                      | 消す。`parts/acceptor/acceptor-brief.md`・`parts/implementer/implementer-brief.md` の決まりは、`agents/acceptor.md` と台本の依頼文が読む置き場（`workflows/` の隣）へ移す | 観察のあと       |
| `skills/implement-step/`・`skills/accept-step/`・`skills/retrospect-step/`・`skills/ship-step/`                                            | 消す。`ship-step` の手順（`tw finish` の打ち方・`## 結果` の必須行・止まったときの表）は `skills/next-task/` の終わりの節へ移す                                           | 観察のあと       |
| `workflows/task-flow.js`                                                                                                                   | 新しく作る                                                                                                                                                                | 最初             |
| `skills/next-task/SKILL.md`                                                                                                                | 書き換える。着手の印のあと、設定の `flow` が `script` なら台本を呼び、完了通知のあと `tw finish` を打つ                                                                   | 台本のあと       |
| `agents/acceptor.md`                                                                                                                       | 残す（台本の受け入れの `agentType`）                                                                                                                                      | —                |
| `agents/retrospector.md`                                                                                                                   | 新しく作る（台本の振り返りの `agentType`。`Agent` を持たない）                                                                                                            | 最初             |
| `skills/retrospect/`・`next-task`・`plan-tasks`・`list-tasks`・`setup-tasks`・`task-model`                                                 | 残す                                                                                                                                                                      | —                |
| `tw brief`（`tw/tw_brief.py`）                                                                                                             | 書き換える。台本の agent が最初に打って依頼文の決まりを読む口として残し、並びのスキルの frontmatter から型を引く部分を消す                                                | 観察のあと       |
| `tw accept`（`tw/tw_accept.py`）                                                                                                           | 残す。台本の受け入れの段の頭で、実装の agent（`no-delegate`）が打つ（受け入れ役は `tw` を打てない）                                                                       | —                |
| `tw step`・`tw pause`・`tw plan-check`・`tw plan-phases`・`tw relay`（`tw/tw_handback.py`・`tw/tw_plan.py`・`tw/tw_relay.py`）             | 残す。`tw relay` の鍵 `再開` は台本の再開の位置（下の5）に使う                                                                                                            | —                |
| `tw escalate-check`（`tw/tw_escalate.py`・`core/escalation.py`）・`tw beat-watch`                                                          | 消す。台本の中に見張りの輪を持たず、難しさの引き上げは台本の `args` の `model` で決める                                                                                   | 観察のあと       |
| `tw handback-guard`（`tw/handback_guard.py`）と `hooks/hooks.json` の `Edit\|Write\|NotebookEdit`・`SubagentHandback`・`SubagentStop` の行 | `SubagentStop` に掛かれば残し、掛からなければ消す（上の2）                                                                                                                | 確かめたあと     |
| `tw lap-hook`（`tw/lap_hook.py`）と `hooks/hooks.json` の `Skill`・`SubagentStart`・`SubagentStop` の行                                    | 書き換える。`retrospector` の `SubagentStart` で `retro` の start を書く規則を足す（最初）。`Skill` の行は並びのスキルを消すときに外す（観察のあと）                      | 最初・観察のあと |
| `tw commit-guard`・`ask-guard`・`ref-guard`・`agent_scope.py`                                                                              | 残す                                                                                                                                                                      | —                |
| `tw config --schema` の `steps` の候補                                                                                                     | 書き換える。スキルの frontmatter を拾う代わりに、台本の段の名前を返す。設定の欄 `flow`（`skills`・`script`）を足す                                                        | 台本のあと       |

tsukumo（このリポジトリ）:

| 対象                                                                                                                                                                     | 扱い                                                                                                                                            | いつ       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `work_plan`・`report` の口（`src/server/work-plan/core/work-plan-tool.ts`・`src/server/report/core/prompt/report-tool.ts`）                                              | 残す                                                                                                                                            | —          |
| `phase_result`（`src/server/work-plan/core/phase-result-tool.ts`・`phase-result.ts`）                                                                                    | 書き換える。任意の欄 `summary` を足し、帯の中間レポートに使う                                                                                   | 最初       |
| 委譲ゲート（`src/server/session-driver/core/call-review.ts`・`src/server/work-plan/core/work-plan-review.ts`・`src/server/session-driver/adapter/sdk/sdk-work-tool.ts`） | 書き換える。`SubagentHandback` の返却に加えて、`Workflow` の完了通知でも立てる                                                                  | 最初       |
| 委譲の返却の事象（`src/shared/session/session-event-delegate.ts`）と `UserPromptSubmit` の注記（`src/server/session-driver/adapter/sdk/sdk-query-seed.ts`）              | 残す。契約は `tsukumo-plugins` 以外のワークフローにも開いているので、`Agent` で委譲するワークフローのために消さない。台本の完了通知の注記を足す | 最初       |
| `delegatedRange`・帯の群の数え方（`src/server/work-plan/core/band-position.ts`・`src/shared/session/work-plan-fold.ts`）                                                 | 残す                                                                                                                                            | —          |
| `docs/architecture/workflow-contract/` の3件・`docs/architecture/display/work-plan.md`                                                                                   | 書き換える。台本の完了通知のゲート・`phase_result` の `summary`・並びの値が台本の段の名前になることを書く                                       | 最初       |
| `docs/architecture/adr/0030-workflow-as-skill-sequence.md`                                                                                                               | 旧い流れを消すときに、ステータスを `置き換え済み（→ 0045）` にする                                                                              | 観察のあと |

### 5. 並走と切り戻し

- **旧い流れと台本の流れを、設定の欄 `flow`（`skills` が既定、`script` が台本）で切り替えて並走させる。** `/next-task` は着手の印のあと欄を読んで分ける。並走のあいだ並びのスキルは消さない
- **切り戻しは欄を `skills` に戻すだけ。** 戻す条件は、台本の流れで送り出した件のうち2件以上が、台本の不具合（段の飛ばし・帯の不整合・関門の抜け）で人の手を要したとき
- **使用量の上限で agent が失敗したときは、その段で止める。** 台本は `agent()` が `null` を返したら後の段を走らせず、`{ stopped: true, phase }` を返す。メインは `tw relay T-xxx 再開` に止まった段を書いて `tw release` し、次の着手で台本を `args.from` に段を渡して呼び直す。`resumeFromRunId` は同じセッションの中でしか効かないので、再開の位置の正典は Beads に置く
- 台本の中の作業は着手した作業ツリーで行い、`isolation: 'worktree'` は使わない（未送信のコミットが見えないため）

### 6. 観察の基準（旧い流れを消してよい条件）

台本の流れで送り出した件が10件（haiku 2件以上・sonnet 5件以上・opus 1件以上）に達し、次を全部満たしたら旧い流れを消してよい。基準線は、同じ期間の旧い流れの `tw metrics --stages` の難しさごとの中央値。

1. 着手から送り出しまでの所要の中央値が、基準線の 1.25 倍以内
2. 1件あたりの `tw verify` の回数（`verify_per_task`）と `ship_verify_failed` の件数が基準線以下
3. 差し戻しの回数の合計が、同じ件数の基準線の合計 + 2 以内（試作の比較で台本版が1回多かったため、件数に比べて小さい幅を許す）
4. 切り戻しの条件（上の5）に当たっていない

1.25 倍は、試作の比較の基準と同じ幅。トークンは比べない（基準線の `token-usage` はメインの毎ターンの記録で、台本の agent の `usage` と取り方が違うため）。

### 7. 置き換えの順と後段の切り方

| 順  | 作業                                                                                                                                                                                    | 作業先          | 難しさ | `loopable` |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------ | ---------- |
| 1   | 契約を台本に合わせる（`phase_result` の `summary`・完了通知の委譲ゲート・契約の文書）                                                                                                   | tsukumo         | opus   | N          |
| 1   | 台本 `task-flow` を書く。最初に plugin の `workflows/` の読み込みと `SubagentStop` の hook の掛かりを確かめる。`agents/retrospector.md` と `tw lap-hook` の `retrospector` の規則を足す | tsukumo-plugins | opus   | N          |
| 2   | `/next-task` から台本を呼び、完了のあと `tw finish` を打つ。設定の欄 `flow` を足す                                                                                                      | tsukumo-plugins | sonnet | N          |
| 3   | 観察（上の6）。10件を台本の流れで送り出す                                                                                                                                               | —               | —      | —          |
| 4   | `task-workflow` と並びの段のスキルを消し、`ship-step` の手順を `next-task` へ移す。`tw brief` を移した置き場から型を引く形に書き換え、`hooks/hooks.json` の `Skill` の行を外す          | tsukumo-plugins | sonnet | N          |
| 5   | 委譲だけの `tw` のサブコマンドと hook を消す（上の4の表の「消す」の行と、確かめの結果で消すと決まった `tw handback-guard`）                                                             | tsukumo-plugins | sonnet | Y          |
| 6   | tsukumo の契約から並びの要素をスキルに限る記述を直し、ADR 0030 を置き換え済みにする                                                                                                     | tsukumo         | sonnet | Y          |

順1の2件は並べて進められる。順2は順1の両方のあと。順4〜6は観察の基準を満たしたあとで、観察のあいだは止めておく。

`loopable` を N にした4件のわけ:

- 順1・2の3件は、確かめに `Workflow` をメインから呼ぶ実機の段がある。`Workflow` は委譲先から呼べず、`/loop` の委譲の流れでは確かめられない
- 順1の契約の課題は、完了通知の見分け方を SDK の型と実機の記録で決める判断が残る
- 順4は、決まり（実装役・受け入れ役の決まり・送り出しの手順）を移す先を選ぶ判断と、旧い流れを消すと戻すのが revert しかない操作を含む

順5・6は、消す対象と直し方がこの ADR と前の段の報告で決まり、消す語の grep で終わりを確かめられるので Y にした。

## 採らなかった案

- **台本を難しさや流れ（近道・メインで行う）ごとに分ける**: 台本ごとに受け入れの輪・帯の渡し方・再開の位置を書き写すことになる。分岐は `args` で足りる
- **並びの設定（`steps`）を消して台本の選択（どの台本を呼ぶか）に置き換える**: 歯車の設定画面と `tw config --schema` の形が変わり、tsukumo の設定の描き方まで直すことになる。欄の形を残して値を替えれば、画面は今のまま振り返りを外せる
- **台本が `schema` で段ごとの結果を返し、メインが完了通知のあとに `work_plan` で写す**: 台本の agent が `phase_result` を呼べると分かったので要らない。写す形だと、台本の走っているあいだ帯が止まる
- **委譲ゲートと委譲の返却の経路を tsukumo から消す**: 契約は `tsukumo-plugins` 以外のワークフローにも開いており、`Agent` で委譲するワークフローは返却のあとの確かめを今も要る（ADR 0024）。消さずに台本の完了通知へ広げる
- **`phase_result` は要約を持たないまま、中間レポートを諦める**: 台本の流れでは段ごとの中間レポートが帯に出なくなる。利用者が作業中に段の結果を追う手段が減る
- **`isolation: 'worktree'` で実装の段を並列にする**: 分岐元が `origin/main` で、着手してからの未送信のコミットが見えない
- **使用量の上限に当たったら `resumeFromRunId` で続ける**: 同じセッションの中でしか効かず、セッションが切れると位置が残らない
- **旧い流れを並走させず一度に置き換える**: 台本の流れの数が試作の2件しか無く、送り出しを含めた流れで確かめていない。切り戻しの道を残す

## 未決

- `SubagentStop` の hook が台本の agent に掛かるか（上の2の `tw handback-guard` の扱いと、`review` の end を誰が書くかが決まる）。台本を書く段の最初に確かめる
- plugin の `workflows/` に置いた台本が、次のセッションで `/tsukumo-workflow:task-flow` として読まれるか。読まれなければ、`/next-task` は台本のファイルのパスを `scriptPath` で渡す
- 台本の agent の `phase_result` が段の順に来なかったときの帯の動き（並列の実装の段を持つとき）
- `Workflow` の規模の目安（既定 `medium`、Pro は `small`）と、Pro で既定がオフであること。`/next-task` の前提の点検（`tw config-doctor`）で知らせるか
