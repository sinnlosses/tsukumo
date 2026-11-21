# ワークフローの部品の契約を、印・タスクの ID・結果の語の3つにする（2026-11-21）

ステータス: 採用

**誰でもワークフローの部品（並びに差し込む段）を作れるよう、契約を「部品の契約」と「オーケストレーターの契約」の2層に分ける。部品の作り手が知るのは、SKILL.md の印・受け取るタスクの ID・返す結果の語の3つだけにする。** 印 `workflow-step` を戻して `tw config --schema` が拾い、`task-flow` は並びに置いた印のあるスキルを、段ごとに起こす agent に呼ばせる。`phase_result` は並びの中の位置（`phase`・`count`）を委譲先に数えさせず、段の id（呼ぶ agent の段か、渡された `step`）で tsukumo が位置を解く。委譲ゲート・ワークプラン前の編集の門などホストの内部の規律は、契約の外（`docs/architecture/display/work-plan.md` と並ぶ `docs/architecture/display/` の子）へ移す。

方向（手の1〜3）は 2026-11-21 の会話で利用者が採った。この ADR は ADR 0045「1. ワークフロースクリプトの置き場と並びの設定」の「並びの段の印は旧い流れを消すときに一緒に消す」を置き換える。契約の文書（`docs/architecture/workflow-contract/`）の書き換えは後段で行い、ここには部品の契約の全文の下書きを置く。

## 何が困っていたか

- `docs/architecture/workflow-contract/skill-sequence.md`「スキルの契約」は、`workflow-step: "true"` の印を `tw config --schema` が拾うと書いている。一方 ADR 0045 はこの印を旧い流れと一緒に消すと決め、`tsukumo-plugins` は消した。いまの `tsukumo-plugins` に語は1か所も無く、`skills/task-model/scripts/core/layout.py` の `SCRIPT_STEPS` が並びの候補を `implement`・`accept`・`retrospect` の3つに固定し、`workflows/task-flow.js` の `ALL_STEPS` も同じ3段だけを走らせる。利用者が自分のスキルを段として足す道が無く、契約の文書は実装と食い違っている
- `phase_result` の必須の引数 `phase`・`count`（`src/server/work-plan/core/phase-result-tool.ts`）は、委譲先に並びの中の位置と範囲の段の数を数えさせる。`task-flow` は受け入れ・振り返りの番号まで依頼文で計算して渡している（`rangeNumber`）。一方 `src/server/work-plan/core/work-plan-review.ts` の `workflowAgentPhase` は、ワークフロースクリプトの写しから agent がどの段にいるかを既に知っている
- 契約の文書は4本・356行・58,549バイト（`wc -lc docs/architecture/workflow-contract.md docs/architecture/workflow-contract/*.md`、2026-11-21）。`port-and-return.md` の後ろ半分は委譲ゲート・ワークプラン前の編集の門・注記の文面で、メインの振る舞いを縛る決まりにあたり、部品の作り手は読まなくてよい

## 前提の裏取り

| 前提                                                                     | 確かめた場所                                                                                      | 結果                                                                                                                             |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 印のあるスキルを走査する仕組みが `tw` にある                             | `tsukumo-plugins` の `layout.py` の `_marked_skills`・`entry_candidates`                          | ある。入口の印 `workflow-entry` が、作業ツリー・ホームの `.claude/skills/` と同じチェックアウトの plugin の `skills/` を走査する |
| `tw plan-phases` が並びの知らない段をプログレスバーの段にできる          | `tsukumo-plugins` の `taskfile.py` の `work_plan_phases` の最後の `else`                          | できる。名前も id も並びの値のまま1段を足す。ただし `layout.script_steps` が先に知らない名前を落とす                             |
| ワークフロースクリプトの agent がどの段にいるかを tsukumo が引ける       | `work-plan-review.ts` の `workflowAgentPhases`（`workflow-progress` の `agentId` → `phaseTitle`） | 引ける。`task-flow` は `phase()` の題に段の id を渡すので、題は段の id になる                                                    |
| 実装役は1体で `## やること` の段を複数返す                               | `task-flow.js` の実装の `agent()` の前の `phase(implementTitle)`（最初の `impl-` の id だけ）     | そのとおり。実装役の agent の段の題は最初の実装の段の id のままで、2段目以降を表さない                                           |
| `phase_result` の handler は呼び手の agent を知らず、`PreToolUse` は知る | `skill-sequence.md`「スキルの契約」の `phase_result` の項・`sdk-implementer-stop-hook.ts`         | そのとおり。`PreToolUse` は `agent_id` を持ち、`updatedInput` で入力を書き換えた前例がある（`sdk-query-seed.ts`）                |

## 決めたこと

### 論点 1: 独自の段は実装より後ろのどこにでも置け、段ごとに起こす agent がスキルを呼ぶ

**採る: 並び（`steps`）の順がそのまま実行の順で、印のあるスキルは `implement` より後ろの位置ならどこにでも置ける（実装と受け入れのあいだ・受け入れと振り返りのあいだ・振り返りのあと）。`task-flow` は並びを先頭から読み、組み込みの3段は今の手順で、それ以外の値は段ごとに新しい agent を1体起こし、その agent が Skill ツールでスキルの全名をタスクの ID を引数に呼ぶ。**

- `implement` より前には置けない。計画（`## やること`）は `task-flow` を起こす前にメインが確かめて渡すので、実装の前の段がコードやタスクを変えると計画の前提が崩れる。`tw config set` が `implement` より前の独自の段を終了コード2で断る
- 独自の段の agent の型は新しく足す `tsukumo-workflow:step-runner`（`IMPLEMENTER_TYPES` に入れない。`tw lap-hook` は初版では lap を書かず、所要は完了通知の `duration_ms` で見る）。model はメインと同じ
- agent はスキルが最後に返した結果の語を `phase_result` と `schema`（`{ outcome, reason?, summary? }`）の両方で返す。`stopped` なら `task-flow` は並びを止め、`{ stopped: true, phase: <段の値>, reason }` を返す。呼び直しの `from` に独自の段の値も渡せる
- **受け入れ役の差し戻しの範囲に独自の段を含めない。** 差し戻しは今のまま直しの agent が受け、実装と受け入れのあいだの独自の段は走り直さない。独自の段が作業ツリーを変えた分も受け入れの対象の差分に入るので、指摘があれば直しの agent が直す
- 受け入れより後ろの独自の段は、作業ツリーを変えない段に限る（受け入れを通らない差分を送り出さないため）。部品の契約に書き、`task-flow` は受け入れのあとの独自の段の agent に「作業ツリーを変えない」と言う。変えたことを機械で止める検査は後段が `tw finish` の入口で確かめ、無ければ足す
- 採らなかった案:
  - **差し込める位置を「受け入れのあと」だけにする**: 整形・文書の追随・追加の検査のような、受け入れに見てほしい段を置けない
  - **独自の段を実装の agent の中で続けて呼ばせる**: 実装の依頼文が部品ごとに伸び、段ごとの `phase_result`・止め方・所要が実装と混ざる
  - **差し戻しのたびに実装と受け入れのあいだの独自の段も走り直す**: 部品が何度走っても同じ結果になる（冪等）とは限らず、差し戻しの1回の費用が段の数だけ増える。走り直しが要る部品は、受け入れのあとの位置で検査だけを返す形で作れる
  - **並びに条件や並列を持たせる**: ADR 0030 の採らなかった案と同じ理由（設定画面が条件の編集画面になる）で、線形の並びと `skipped` のまま

### 論点 2: 印は `workflow-step`、拾う範囲は入口の印と同じ3か所、プログレスバーの段の名前は印の題

**採る: SKILL.md の frontmatter の `metadata` の `workflow-step: "true"` を印、`workflow-step-title` を日本語の段の名前にする。`tw config --schema` は入口の印（`workflow-entry`）と同じ走査（`_marked_skills`）で、作業ツリーの `.claude/skills/`・利用者の `~/.claude/skills/`（リンクを含む）・`tw` と同じチェックアウトの plugin の `skills/` から拾い、`steps` の `values` の組み込みの3段の後ろに足す。**

- `value` は Skill ツールで呼ぶ全名（plugin のスキルは `<プラグイン>:<名前>`）、`label` は frontmatter の `name`、`title` は `workflow-step-title`（無ければ `label`）、`description` は frontmatter の `description`。いまの `skill-sequence.md` の記述と同じ形で、契約の文書が既に言っていることを実装に戻す
- `layout.script_steps` は知らない名前を落とすのをやめ、候補にある独自の段の値を残す。候補にも組み込みにも無い値（スキルを消した・別の作業ツリーにしか無い）は `tw plan-phases` が段にせず、`tw config-doctor` が名前を挙げて知らせる。tsukumo は今までどおり、`values` に無い値も今の値にあれば消さずに並べる
- `tw plan-phases` は独自の段を1段にし、id はスキルの全名、名前は `title`。範囲（`delegatedRange`）には数えない（`widen_range` は独自の段で切れる今の振る舞いのまま）。独自の段の進み方は論点 3 の段の id の解き方と、ワークフロースクリプトの写し（`phaseTitle` が段の id に一致すると今の段にする）で足りる
- 採らなかった案:
  - **印をやめ、どのスキルも並びに置ける**: 結果の語を返さないスキルが並びを黙って止める（2026-11-21 の会話で却下）
  - **ほかの plugin（`~/.claude/plugins/` の取り込み）のスキルも拾う**: どの plugin が有効かを `tw` は知らず、取り込みの置き場は Claude Code の版で変わる。使いたい部品はリンクで `~/.claude/skills/` に入れれば拾える
  - **作業ツリーの `.claude/skills/` だけを拾う**: 利用者が全プロジェクトで使う部品を、プロジェクトごとに置き直すことになる
  - **新しい印の名前（`workflow-part` など）にする**: 既存の文書と ADR 0030 の語を書き換えるだけの差分が増え、得るものが無い

### 論点 3: `phase_result` の位置は段の id で解き、`phase`・`count` は互換のためだけに残す

**採る: `phase_result` に任意の欄 `step`（段の id）を足し、`phase`・`count` を任意にする。tsukumo は次の順で、結果を返す段を1つに決める。決まった段が今の段の集合にあれば済ませ、無ければ動かさない（段の id を渡したワークプランでの一足飛び・戻りの差し戻しは今のまま）。**

1. `step` があれば、その id の段（ワークプランの `phases` の id に無ければ差し戻す）
2. `step` が無く、呼んだ agent がワークフロースクリプトの写しにいれば、その agent の段の題に一致する id の段
3. どちらも無ければ、今までの `phase`・`count` と `delegatedRange` の範囲で解く（古い依頼文・`Agent` で委譲するワークフロー）

- 2 の「呼んだ agent」は、`phase_result` の `PreToolUse` のフックが `agent_id` から `workflowAgentPhase` で引き、`updatedInput` で入力の `step` に書き足して handler へ渡す（handler は呼び手を知らないため）。後段は最初に、サブエージェントの中の MCP ツールの呼び出しで `updatedInput` が handler の入力に届くことを確かめ、届かなければ `WorkPlanReview` に `agent_id` ごとの待ちの id を覚える形に替える
- **1体で複数の段を返す委譲先（実装役）は `step` を渡す。** `task-flow` は実装役の依頼文に `## やること` の段の番号と段の id（`impl-1` …）の対応を書き、実装役は段ごとに `{ step: "impl-<n>", outcome, summary }` で呼ぶ。段の id は依頼文から写すだけで、範囲の段の数は数えない。受け入れ・振り返り・独自の段の agent は1体が1段なので、`step` も渡さない
- 部品のスキルは `phase_result` を呼ばない。呼ぶのは段を走らせる agent（論点 1）で、部品の契約には出てこない
- 互換: `phase`・`count` は、取り込みの `vendor/tsukumo-plugins` の固定したコミットが `phase_result` に `count` を渡す依頼文を持たなくなるまで受ける（`grep -rn 'count:' vendor/tsukumo-plugins/workflows/` の `phase_result` の行が0件になった版）。その版へ上げたあと、`phase`・`count` と範囲で解く道（上の3）を外す課題を別に積む。外すまでは、`step` と `phase` の両方があれば `step` を使う
- 採らなかった案:
  - **実装役だけ `phase`（`## やること` の段の番号）を残す**: tsukumo が「番号 n → id `impl-<n>`」の対応を持つことになり、`tsukumo-plugins` の id の付け方を core が知る（ADR 0024）。番号を agent の段から数える一般の規則にすると、並列の段で意味が揺れる
  - **`## やること` の段ごとに実装役の agent を分ける**: 段のあいだで文脈が切れ、同じファイルを読み直す費用が段の数だけ増える。段の続きを `SendMessage` で渡していた旧い流れの利点も失う
  - **`step` も無いときは「今の段」を済ませる**: 並列の段では今の段が2つ以上あり、黙って違う段を済ませる
  - **`phase`・`count` をすぐ外す**: 取り込み済みの plugin の依頼文は送り出しの単位でしか替わらず、その間の返却でプログレスバーが止まる

### 論点 4: 契約は2層で、ホストの内部の規律は契約の外へ

**採る: 部品の作り手が読むのは「部品の契約」1枚（下の全文の下書き）。オーケストレーターを書く人が読むのは「オーケストレーターの契約」。どちらにも当たらないホストの内部の規律は、`docs/architecture/display/work-plan.md` と並ぶ `docs/architecture/display/` の子へ移す。**

| もの                                                                                                                       | 置き場                                                                                                        | 理由                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 印（`workflow-step`・`workflow-step-title`）・受け取るもの・結果の語・位置の縛り                                           | 部品の契約                                                                                                    | 部品の作り手が書くもの・守るものそのもの                                                               |
| `work_plan`（`phases`・`current`・`finishedInGroup`・`phaseSummary`・`skippedPhases`）                                     | オーケストレーターの契約                                                                                      | メインが呼ぶ口                                                                                         |
| `delegatedRange`・`phase_result`（`step` と互換の `phase`・`count`）                                                       | オーケストレーターの契約                                                                                      | 委譲先を起こす側が依頼文で呼ばせる口。部品は呼ばない                                                   |
| `report` の `task`・`workPlanClosing`・`retrospective`                                                                     | オーケストレーターの契約                                                                                      | 依頼の締めの口                                                                                         |
| 設定コマンド（`tw config --schema`・`set`・`--json`）・Beads の欄・検証の控え                                              | オーケストレーターの契約                                                                                      | ワークフローが持つコマンドと tsukumo が読む欄。部品の契約からは名前だけ指す                            |
| してよいこと・tsukumo が読まないもの・合わせ方（`ask-guard`・`lap-hook`）                                                  | オーケストレーターの契約                                                                                      | ワークフローを tsukumo に当てる人の決まり                                                              |
| `speak` の `phase`                                                                                                         | オーケストレーターの契約                                                                                      | メインのセリフの引数で、範囲と照らす。検査の細部は契約の外                                             |
| 委譲ゲート・ワークプラン前の編集の門・返却の注記の文面・差し戻しの文面・まとめ待ちの段・組み直し・飛ばした段の印の差し戻し | 契約の外（`docs/architecture/display/work-plan.md` と並ぶ `docs/architecture/display/` の子に新しいファイル） | tsukumo がメインを縛る振る舞いで、どのワークフローにも同じに掛かる。ワークフローの側は守る手を持たない |

- オーケストレーターの契約は今の `workflow-contract.md` と子の3本の器を使い、部品の契約は新しい子のファイル1本にする。契約の入口の表から部品の契約を先に指す
- 採らなかった案:
  - **契約を1本のまま、節の順だけ替える**: 部品の作り手が読む範囲を表の上で区切れず、ゲートの細部が同じファイルに残る
  - **ゲートと門もオーケストレーターの契約に残す**: ワークフローの側は従うだけで選べない。拒否文の文面が変わるたびに契約の文書が動く
  - **`speak` の `phase` を契約の外へ出す**: メインが番号を言うときに渡す引数で、オーケストレーターが依頼文で教えることがある

### 論点 5: 後段は4件（独自の段・`phase_result` の受け口・依頼文の切り替え・契約の分割）

**採る: 今の後段3件に、`tsukumo-plugins` の依頼文を `step` に切り替える1件を足して4件にする。** 受け口（tsukumo）と依頼文（`tsukumo-plugins`）は作業先が違い、受け口が互換を持つので、受け口を先に送ってから依頼文を切り替える。

| 後段                                                                 | 作業先            | 依存                                                   |
| -------------------------------------------------------------------- | ----------------- | ------------------------------------------------------ |
| 印のあるスキルを `steps` に拾い、`task-flow` が走らせる（論点 1・2） | `tsukumo-plugins` | この ADR                                               |
| `phase_result` を段の id で解く受け口（論点 3 の 1・2 と互換）       | tsukumo           | この ADR                                               |
| `task-flow` の依頼文を `step` に切り替え、`count` の計算を外す       | `tsukumo-plugins` | 受け口の件・独自の段の件（同じ `task-flow.js` を触る） |
| 契約を2層に分け、内部の規律を外へ移す（論点 4・下書きを清書）        | tsukumo           | 上の3件                                                |

- 独自の段の件は受け口の件を待たない。独自の段のプログレスバーは、ワークフロースクリプトの写しで今の段になり、次の段が始まると済む。`phase_result` の `summary` が中間レポートに出るのは、受け口と依頼文の切り替えが入ってから
- `phase`・`count` と範囲で解く道を外す件は、取り込みの版が上がってから積む（論点 3 の互換）。いまは積まない
- 採らなかった案:
  - **受け口と依頼文の切り替えを1件にする**: 2つのリポジトリを1件で送ると、取り込みの submodule の更新と順が絡み、片方だけ送れない
  - **契約の分割を先に送る**: 独自の段と `step` が入る前の形を書くことになり、2度書き直す

## 部品の契約（全文の下書き）

後段で `docs/architecture/workflow-contract/` の新しい子のファイルに清書する。

> **部品は、ワークフローの並びに差し込めるスキル。** 作り手が守るのはこの3つだけ。
>
> 1. **印**: SKILL.md の frontmatter の `metadata` に `workflow-step: "true"` を置く。段の名前を日本語で出したければ `workflow-step-title: "<名前>"` も置く（無ければ `name`）。置き場は作業ツリーの `.claude/skills/`・`~/.claude/skills/`（リンクでよい）・ワークフローの plugin の `skills/` のどれか。印のあるスキルが歯車の設定の「並び」の候補に出る
> 2. **受け取るもの**: 呼び出しの引数のタスクの ID 1つ。それ以外を会話の文脈から受け取らない。前の段の結果とタスクの中身は `tw show <ID>`（Beads）から読み、自分の結果の中身（したこと・分かったこと）も Beads に書く
> 3. **返すもの**: 手順の最後に、結果の語を1つと1〜2文を返す。
>    - `finished`: 済ませた。1〜2文はプログレスバーの中間レポートに出る
>    - `skipped`: この回は要らなかった（近道・条件に当たらない）。1〜2文は飛ばしたわけ
>    - `stopped`: 途中で止めた。1〜2文は止めた理由。並びはここで止まり、同じタスクを呼び直すとこの段から再開する
>
> 置ける位置: 実装（`implement`）より後ろならどこでも。受け入れ（`accept`）より前に置いた部品の変更は受け入れの対象になり、受け入れより後ろに置いた部品は作業ツリーを変えない。差し戻しで部品は走り直さない。
>
> 部品は、プログレスバー・委譲・ワークプランのツール（`work_plan`・`phase_result`・`report`）を呼ばない。段を走らせるのはワークフローで、結果の語をプログレスバーへ写すのもワークフロー。
> 部品はコミット・送り出しをしない（`tw` の関門が拒む）。

## オーケストレーターの契約へ移す・残すもの

- 残す: `work_plan` の引数の表・`report` の契約の欄の表・`delegatedRange` と群の数え方・`phase_result` の引数（`step`・`outcome`・`reason`・`summary`、互換の `phase`・`count`）と位置の解き方（論点 3 の順）・飛ばした段の印の決まりのうちワークフローが渡すもの（`skippedPhases` の意味）・設定コマンドと Beads の欄（`config-and-beads.md` のまま）・検証の控え・してよいこと・読まないもの・合わせ方
- 書き足す: `steps` の候補に独自の段が入ること（`values` の組み込みの後ろ・`implement` より前に置けない・候補に無い値の扱い）、段を走らせる agent が結果の語を `phase_result` へ写すこと
- 外へ移す（`docs/architecture/display/work-plan.md` と並ぶ `docs/architecture/display/` の子の新しいファイル）: 委譲ゲート・ワークプラン前の編集の門・返却の注記の文面・`phase_result` と `work_plan` の差し戻しの文面・まとめ待ちの段・組み直しで戻るもの戻らないもの・飛ばした段の印の差し戻しの判定（`WorkPlanReview` の細部）・`speak` の `phase` の検査の細部
- 消す: `skill-sequence.md` のうち、今の実装と食い違う記述（印が消えた前提の記述が無いか・並びの値の説明）を清書のときに洗う

## 結果

- 部品の作り手が読む分は、上の下書きで約20行。今の契約の文書（356行）は読まなくてよい
- `task-flow` の依頼文から範囲の番号の計算（`rangeNumber`・`phaseCount` の写し）が消え、委譲先は段の id を写すか何も渡さない
- 印のあるスキルは、`tsukumo-plugins` に入っていなくても歯車の設定の並びに出る。tsukumo のコードは並びも印も読まないまま（ADR 0024）

## 残したこと

- 独自の段の lap を台帳に書くか（`tw lap-hook` の `step-runner` の扱い）。所要の集計で独自の段を見たくなったら決める
- 独自の段に model や effort を部品側から指定させるか。初版はメインの model
- 受け入れのあとの独自の段が作業ツリーを変えたことを止める検査の置き場（後段が `tw finish` の入口の既存の検査で足りるかを確かめる）
