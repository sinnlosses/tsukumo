# ワークフローの契約: 口と委譲の返却

ステータス: **正典**。入口は `docs/architecture/workflow-contract.md`（ワークフローの契約の全体）。

責務: tsukumo がワークフローから受ける2つの口（`work_plan`・`report`）の名前と引数の意味、委譲先の返却（`phase_result`）での帯の進め方、委譲ゲートを持つ。
読む時: 口の引数を変える・使う、帯の進め方や委譲ゲートを直すとき。
直す時: 口の引数・委譲の返却の書式と帯の進め方・委譲ゲートを変えたとき。

## 口

口は MCP ツール `work_plan` と `report`、委譲先が呼ぶ `phase_result`（`docs/architecture/workflow-contract/skill-sequence.md`「スキルの契約」）。意味はツールの説明（`src/server/work-plan/core/work-plan-tool.ts`・
`src/server/report/core/report-tool.ts`・`src/server/work-plan/core/phase-result-tool.ts`）とシステムプロンプトの「ワークプラン（tsukumo）」の節がモデルに教える。

`work_plan`（ワークプラン。毎回段の並びごと渡す）:

| 引数              | 意味                                                                                                                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `phases`          | 段の並び（1つ以上）。要素は段の名前か、同時に走る段の名前の配列（並列の段。2つ以上・重ならない）。段の番号は並びを平らにした読み順                                                                                                                                             |
| `current`         | 今の要素の位置（0始まり）。全部済んだら要素の数。`current` が要素の数に等しい `work_plan` の呼び出しは差し戻す。全部済みにするのは `report` の `workPlanClosing` だけ                                                                                                          |
| `finishedInGroup` | `current` が並列の段を指すとき、その中で済んだ段の名前。並列の段の最後の段を済ませる呼び出しでは `current` を進めて空にする                                                                                                                                                    |
| `phaseSummary`    | 終えた段でしたこと・分かったことを1〜2文で。済んだ段があり全部は済んでいない呼び出しで必須。`phase_result` で進んだ位置でも省けない（下の「委譲の返却」）                                                                                                                      |
| `delegatedRange`  | 委譲先の段の範囲。`first`（委譲先の段1に当たる位置。平らにした並びで0始まり）と `count`（段の数）。`count` を省くと `pending`（段の数が未定）。委譲しないときは省く。下の「委譲の返却」                                                                                        |
| `skippedPhases`   | 済んだ段のうち、飛ばした段の名前の配列（`docs/architecture/workflow-contract/skill-sequence.md`「スキルの契約」の「飛ばした段の印の決まり」）。`phases` の名前に含まれ、その呼び出しで済んでいる段だけ。毎回の呼び出しで、メインが飛ばした段をすべて渡す。飛ばさなかったら省く |

依頼の最初の `work_plan` は段1（`current: 0`）で渡す。その依頼でまだ `work_plan` を受けておらず、`delegatedRange` が範囲でなく、`current` が 1 以上（済んだ段あり）の呼び出しは差し戻される（段ごとの所要が「不明」になるため。委譲の途中からの再開は範囲付きなので通る）。
段は1つずつ進める（平らにした並びで済んだ段を1回で2つ以上増やす呼び出しは差し戻される。飛ばした段も済んだ段に数える）。並列にできるかを決めるのは渡す側で、
tsukumo は推し量らない。
受け付けた呼び出しの戻り値は `ok` の次の行に、帯の今の段（「3/6 段の名前」。`delegatedRange` があれば「本 2/3 段の名前」「後 1/3 段の名前」のように群の名と群の中の番号）を返す。

`report`（ターンの結果）のうち契約に当たる欄:

| 引数              | 意味                                                                                                                                                                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `task`            | タスクの作業のレポートのときだけ。`id`（Beads の ID）・`name`（作業の名前）・`outcome`（`finished` 終えた／`stopped` 止めた／`awaiting-answer` 利用者の答え待ち）・`genre`（報告の種類。`work`／`decision`／`research`。省略可、無い・読めないときは `unspecified`）                                      |
| `workPlanClosing` | 段の閉じ方。`work_plan` を渡した依頼では必須。`finished`（最後の段にいるときに渡すと tsukumo が帯を全部済みにする）／`stopped`（止まった段が「今」のまま残る）                                                                                                                                            |
| `figure`          | 必須。レポートの図1つ（`image`・`mermaid`・`graph`・`svg`・`beforeAfter`・`chart`・`stats`・`dimension` の塊）か、`{ kind: "none", reason }`（`short-answer`／`no-shape`／`single-value`／`no-material`）。理由が本文と合わないと差し戻す（`docs/architecture/display.md`「出力の分離（セリフと詳細）」） |

`retrospective`（任意）は、ワークフローに振り返りの段があるとき、その結果を本文の節に混ぜずに受ける欄。
`summary`（結果の1〜2文）と `drafts`（積んだドラフトのタスクID。積まなければ空）を持ち、`sections` の後ろ・`favor` の前に専用の塊として描く。
tsukumo は帯の段の名前を見ず、欄があるときだけ描く（段の名前を契約にすると他のワークフローを縛るため）。欄が欠けても差し戻さず、数えない。

`task.outcome` は目録の1行の終わり方で、帯は閉じない。どこへ送ったかは tsukumo の関心にしない。
`task.genre` は種類ごとの既定の節の並びを選ぶだけで、描き方も差し戻しも変えない（並びの正典は `REPORT_TASK_DESCRIPTION`）。
`checks` に `ng` の行がある `report` の `finished` は差し戻す（`docs/architecture/display.md`「出力の分離（セリフと詳細）」）。

## 委譲の返却

**委譲先は `phase_result`（MCP ツール。`docs/architecture/workflow-contract/skill-sequence.md`「スキルの契約」）で段の結果を返し、tsukumo は `SubagentHandback` の本文を読まない。** `SubagentHandback` は委譲ゲートを立て、注記を運ぶだけ。
書式の正典はこの節と `docs/architecture/workflow-contract/skill-sequence.md`「スキルの契約」で、ワークフローの依頼文はこれを参照し、書式を言い直さない。経緯と採らなかった案は `docs/architecture/adr/0024-no-skill-dependency.md`「2026-10-10 の改訂」と `docs/architecture/adr/0030-workflow-as-skill-sequence.md`。

帯を動かすのは `phase_result` の `finished`・`skipped` だけで、受け付けた呼び出しの時刻と引数で動く。
`phase_result` を呼ばなかった委譲先（古い plugin、計画だけの回）の返却では帯は動かない。
その返却も委譲ゲートは立ち、注記は返却ごとに「委譲先は `phase_result` で結果を返した。」か「委譲先は `phase_result` を呼ばなかったので、返却では帯は動いていない（計画だけの回なら正しい）。」と言う。
「呼んだか」は委譲先ごとに見る。委譲先のメッセージの `parent_tool_use_id` で `phase_result` の呼び出しと返却を対にし、形の合う呼び出しのあとの最初の返却1件だけが「呼んだ」になる。

帯の進め方:

- **帯の段と委譲先の段は1つずつ対応させる。** メインは `work_plan` の `delegatedRange` で、委譲先の段1〜`N` に当たる帯の段の範囲を宣言する。
  **帯の段は、範囲の前（前）・範囲（本）・範囲の後ろ（後）の3つの群に分かれ、群ごとに1から数える。** 群は `delegatedRange` の位置だけで決まり、
  ほかの引数は持たない。本の段は帯でも委譲先の段と同じ番号（範囲の先頭が 1、段の数は `N`）で、前・後の段（計画・受け入れ・振り返り・送り出しなど）は
  「前 1/1」「後 2/3」のように群の名を付けて数える。範囲の無い依頼は並び全体が1つの群で、群の名を付けずに通し番号で数える。
  範囲の前後にメインの段を置いてよい。範囲の中に並列の段を置いてよいが、範囲の端をまたぐ並列の段は差し戻す
- 計画を委譲先に頼む最初の呼び出しは `delegatedRange` を `{ first }` だけで渡す（`pending`。`N` が未定のため）。
  そのあいだ前の段だけが番号を持ち、範囲の先頭から後ろの段は番号を持たず（右肩に位置を出さない）、範囲の先頭の丸が「…」になり、委譲先の `phase_result` では動かない。
  同じ依頼で `phase_result` を受けたあと、範囲の無い・`pending` の `work_plan` と、範囲の段の数が `phase_result` の `count` と違う `work_plan` は差し戻す。
  計画だけの回の返却は `phase_result` を呼ばないので、範囲の差し戻しは掛からない。範囲を宣言しない依頼（`phase_result` を受けない委譲）は今までどおり通る
- セリフが委譲先の段を番号で言うときは、その番号を `speak` の任意の引数 `phase` で申告する。範囲があるあいだ、`phase` が 1〜`N` の外なら差し戻す。
  セリフ・レポート・`phaseSummary` の本文の段の番号は読まず、`phase` を省いた `speak` は検査しない。
  セリフで番号を言うのは本の段だけで、前・後の段は名前で言う（帯が「後 1/3」と出しても、セリフの「段1」は本の段1を指す）
- **`phase_result` の `finished`・`skipped`（`phase` が `n`、`count` が `N`）が届き、段 `n` に当たる帯の段が今の段の集合に入っていれば、tsukumo がその段を受け付けた呼び出しの時刻で済ませる**
  （1本道なら `current` を1つ進め、並列の段の中なら `finishedInGroup` に足す。並列の段の最後に残った段なら `current` を進めて空にする）
- 一足飛び（段 `n` が今の段の集合より先）・もう済んだ段・`stopped`・範囲を宣言していない（`pending` を含む）依頼・`count` が範囲の段の数と違う呼び出しは帯を動かさない
- `phase_result` では帯を全部済みにしない。最後の段を閉じるのは今までどおり `report` の `workPlanClosing`
- `phase_result` で進んだあとにメインが同じ位置を渡す `work_plan` は、段のまとめ `phaseSummary` が要る（`phase_result` は要約を持たない。`docs/architecture/workflow-contract/skill-sequence.md`「スキルの契約」）

委譲ゲート:

- **効く範囲**: 仕事のセッション（`work_plan` が載る）で、同じ依頼にメインの受け付けたワークプランがあるときだけ。雑談のセッションの委譲と、
  ワークプランを渡していない依頼（`work_plan` を呼ばない依頼）の返却では立てない。`delegatedRange` の宣言は条件にしない
- **返却が届いたら印を立て、メインの `work_plan` が受け付けられたら下ろす。** 返却の中身は見ず、届いた事実だけで立てる
  （`phase_result` を呼ばなかった返却・やり直し・`stopped` でも立つ）。返却の数は数えず、続けて届いても `work_plan` 1回で下りる。差し戻された `work_plan` では下りない
- **印が立っているあいだ、メインの作業のツールを拒む。** 通すのは読み取りのツール（`Read`・`Grep`・`Glob`・`ToolSearch`）と
  tsukumo の MCP ツール（`speak`・`work_plan`・`report` など）。委譲先のツールは対象にしない。
  拒否文の末尾に、返却で進んだあとの帯の位置（`work_plan` の戻り値と同じ文）を足す
- **返却を運ぶメインの入力に、返却の本文とは別の tsukumo の注記を1回だけ添える。** 注記は返却ごとに「`phase_result` で結果を返した」か「`phase_result` を呼ばなかったので帯は動いていない」かを言い、末尾に次の帯の段と
  群ごとの数え方と、本の番号が委譲先の段と同じであることと、セリフで番号を言うのは本の段だけなこと（`work_plan` の戻り値と同じ文）を付ける。返却が続けて届けば、まだ添えていない返却の文を重ねる。
  受け付けた `work_plan`・次の依頼で溜めた注記を捨て、組み直しでは足さない。
  口は `UserPromptSubmit` のフックで、返却の入力（`<agent-message` で始まる）はメインが手すきでもターンの途中でもここを1回通る
- 印と注記の元は、委譲先の `SubagentHandback` の呼び出し（`delegate-handed-back`）と `phase_result` の呼び出し（`phase-result-called`）で、委譲先のメッセージのうちこの2つだけを `WorkPlanReview` に通す。
  委譲先が `SubagentHandback` で返すのは、許可モードが `auto` で auto に対応するモデルのときだけで、それ以外の返却（`<task-notification>`）では印も注記も立たない
- 差し戻しの返却を受けて同じ段をやり直させるときは、同じ位置のまま `work_plan` を呼べば下りる
- 印は組み直しでは戻さない
- 許可の口は `PreToolUse` のフック（許可モードによらず毎回呼ばれ、`agent_id` でサブエージェントの中を見分けられる）。疑似セッションは `work_plan` の判定もしないので、委譲ゲートも効かない

ワークプラン前の編集の門:

- **効く範囲**: 仕事のセッションのメインだけ。雑談のセッションと、サブエージェントの中の呼び出しは対象にしない
- **条件**: その依頼で受け付け済みの `work_plan` が無いあいだ（`WorkPlanReview.planMissing`）。判定は記録の事実だけで、文面は読まない。
  差し戻された `work_plan` のあいだも受け付け済みは無いので拒み続け、`request` で掛かり直す。最後の段を `report` で閉じたあとは掛からない
- **拒むもの**: `Edit` と `Write` だけ。`Bash`・`Agent`・`SendMessage`・`NotebookEdit`・読み取りのツール・tsukumo のツールは通す。
  拒否文は `work_plan` を `current: 0`（段1）で先に渡すよう言い、帯の位置は足さない。利用者には見えない差し戻し
- **通すもの**: 自動メモリの置き場（`…/.claude/projects/<1語>/memory/…`。`..` を含むパスは除く）への書き込み
- 委譲ゲートの印（`gateRaised`）とは別の判定で、意味を混ぜない。口は同じ `PreToolUse` のフック（`judgeEditAgainstMissingPlan`）
