# ワークフローの契約: スキルの並び

ステータス: **正典**。入口は `docs/architecture/workflow-contract.md`（ワークフローの契約の全体）。

責務: 並びに置くスキルの印・受け取るもの・返すもの、返却のツール `phase_result`、ワークフローがしてよいことと tsukumo が読まないもの、利用者独自のワークフローが合わせる相手を持つ。
読む時: 並びに置くスキルを書く、独自のワークフローを tsukumo に当てる、`phase_result` や飛ばした段の印を直すとき。
直す時: スキルの契約・読まないもの・合わせ方を変えたとき。

## 節の索引

| 節              | 小節 |
| --------------- | ---- |
| ## スキルの契約 |      |
| ## してよいこと |      |
| ## 合わせ方     |      |

## スキルの契約

**ワークフローは、契約を満たすスキルの並び（schema 2 の `steps`）。** 並びの要素はスキルだけで、エージェントはスキルが中で使う道具として並びに出さない。
並びは線形で、近道・`loopable`・メインで行うのような分岐は並びで表さず、各スキルが「飛ばした」と返す。並びの中の並列は持たない（段の中の並列はスキルの中で行う）。
並びを読んで順に呼ぶのはワークフローのオーケストレーターで、tsukumo は並びを読まない。帯は今までどおりメインの `work_plan` で受ける。
tsukumo が並びに課す縛りは「1つ以上」だけで、送り出しのスキルも並びの1つとして外せる。
この節は schema 2 の契約で、`phase_result` と `work_plan` の `skippedPhases` は入っており、飛ばした段の帯での描き方は `docs/architecture/display.md`「ワークプラン」に入っている。経緯と採らなかった案は `docs/architecture/adr/0030-workflow-as-skill-sequence.md`。

**印（候補になる宣言）**: 並びに置けるスキルは、SKILL.md の frontmatter の `metadata` に `workflow-step: "true"` を持つものだけ。
`metadata` は Agent Skills の書式で、書式に無い属性を文字から文字への対応で置く欄。印を拾うのは `tw config --schema`で、tsukumo は frontmatter を読まない。

- `tw` が拾う範囲: 作業ツリーの `.claude/skills/`・利用者の `~/.claude/skills/`（リンクで入れたものを含む）・`tw` と同じチェックアウトの plugin の `skills/`。ほかの plugin のスキルは拾わない
- 拾ったスキルは `steps` の `values` の1つになる。`value` は Skill ツールで呼ぶ全名（plugin のスキルは `<プラグイン>:<名前>`）、`label` は frontmatter の `name`、`title` は `metadata` の `workflow-step-title`（無ければ `label` と同じ）、`description` は frontmatter の `description`

**受け取るもの**:

- 呼び出しの引数のタスクの ID 1つ。それ以外を会話の文脈から受け取らない
- 前段の結果は Beads の欄から読む。どの欄・節に書くかはワークフローが決め、tsukumo は `docs/architecture/workflow-contract/config-and-beads.md`「Beads の欄」のほかは読まない。
  止まった段から再開するための位置も、ワークフローが Beads に残す

**返すもの**: 段の結果を3つの語の1つで返す。結果の中身（何をしたか・何が分かったか）は Beads に書き、返す値には入れない。

| 結果       | 意味                                                    | 並びと帯                                                                                                                                                  |
| ---------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `finished` | 段を済ませた                                            | 次のスキルへ進む。帯の段を済ませる                                                                                                                        |
| `skipped`  | 段を飛ばした（近道・`loopable` などでこの段が要らない） | 次のスキルへ進む。帯の段を飛ばした段として済ませる。どちらの口から返しても帯は同じになる（描き方は `docs/architecture/display.md`「ワークプラン」が持つ） |
| `stopped`  | 段の途中で止めた。理由を添える                          | 並び全体を止め、後のスキルを呼ばない。帯は止まった段が「今」のまま残る。同じタスクを呼び直すと止まった段から再開する                                      |

返す口は、段がどこで走るかで2つある。どちらも許す:

- **メインで走る段**: `finished`・`skipped` は `work_plan` で次の位置へ進め、`phaseSummary` に段のまとめ（`skipped` なら飛ばしたわけ）を書く。
  `skipped` は、その段の名前を `skippedPhases` に入れる。`stopped` は `report` の `workPlanClosing` に `stopped` を渡す
- **委譲先で走る段**: 委譲先が `SubagentHandback` の前に `phase_result` を呼ぶ

飛ばした段の印の決まり（どちらの口でも、印の付いた段は帯で同じに描く）:

- **メインで走る段の `skipped`**: `work_plan` の `skippedPhases` に入れた段に印が付く。`skippedPhases` の名前は `phases` に含まれ、その呼び出しで済んでいる段
  （`current` より前の要素の段か `finishedInGroup` の段）でなければ差し戻す。毎回の呼び出しで、メインが飛ばした段をすべて渡す。
  前に受け付けた呼び出しで印なしに済んでいた段を新しく入れる呼び出しは差し戻す（済ませた段をあとから飛ばした段に変えない）。
  前に受け付けた呼び出しで `skippedPhases` に入れた段を、その呼び出しでもまだ済んでいるのに外した呼び出しも差し戻す（飛ばした段をあとから済ませた段に変えない。
  黙って印を消すことも残すこともしない）。その段が済んでいなくなった（位置を戻した・並びから消えた）呼び出しでは、印も消える。
  どちらの判定も受け付けた呼び出しを覚えている `WorkPlanReview` が行う。印は段の名前で持つので、同じ名前の段は見分けない
- **委譲先で走る段の `skipped`**: 受け付けた `phase_result` が段を済ませるときに印が付く。メインはその段を `skippedPhases` に入れなくてよく（入れてもよい）、
  入れなくても印は消えない。`phase_result` で付いた印は `WorkPlanReview` が覚え、同じ依頼のワークプランのあいだ、その段が済んでいるかぎり残す
  （受け付けた `work_plan` の記録に足す）。組み直しでは戻らない（`phase_result` の呼び出しは委譲先の transcript にあり、組み直しはメインの transcript だけを読む）
- **範囲の外の段・済んだ段の `skipped`**: `phase_result` が帯を動かさない条件（範囲が無い・`pending`・一足飛び・済んだ段・`count` の違い）に当たれば、印も付けない。
  `work_plan` では、済んでいない段の名前と、印なしに済んでいた段の名前は差し戻す（上の項）
- `skippedPhases` も段を1つずつ進める決まりに従う。飛ばした段も済んだ段に数え、`phaseSummary` に飛ばしたわけを書く

**帯の段の名前・位置・範囲の正しさは、ワークフロー側が機械的に決めて検査する。** メインが自分で書くのは `phaseSummary` だけにし、それを保証するのはワークフローの責務。
tsukumo の `work_plan` が見るのは、呼び出しの中と呼び出しどうしの辻褄（上の差し戻し）だけで、ワークフローの期待値（正しい段の名前・最初の位置）とは照らさない。
最初の呼び出しの位置（`current > 0`）も差し戻さない。理由は2つ。(1) 最初の呼び出しが途中の位置で始まるのは、再開と前の依頼から続く並びで正当に起きるので、
`current > 0` だけを差し戻すと再開が通らない。(2) 正しい名前と位置はワークフローの記録（`tw` なら `tw plan-phases`）にしか無く、tsukumo はそれを読まない（`docs/architecture/adr/0024-no-skill-dependency.md`）。
ワークフローが検査するなら、`work_plan` の `PreToolUse` のフック（`mcp__tsukumo__work_plan`。許可モードによらず毎回呼ばれる）で、引数を自分の期待値と照らして拒む。

`phase_result`（構造化した返却。委譲先が段ごとに1回呼ぶ）:

| 引数      | 意味                                                                     |
| --------- | ------------------------------------------------------------------------ |
| `phase`   | 結果を返す委譲先の段の番号（1始まり）。`delegatedRange` の範囲の中の番号 |
| `count`   | 委譲先の段の数                                                           |
| `outcome` | `finished`・`skipped`・`stopped`（上の表）                               |
| `reason`  | 止めた理由を1〜2文で。`outcome` が `stopped` のときだけ渡す              |

- 引数は zod で検証し、形が合わなければ差し戻す（`phase` が 1〜`count` の外、`reason` の有無が `outcome` と合わない・空白だけの `reason`）。
  メインの呼び出しは `PreToolUse` のフックが `agent_id` の無い呼び出しとして拒む（メインは `work_plan` で進める。SDK の handler は呼び手を知らないので、handler では見分けない）
- 受け付けた呼び出しは、`docs/architecture/workflow-contract/port-and-return.md`「帯の進め方」の条件で帯を動かす。`finished`・`skipped` は段 `phase` に当たる帯の段を済ませ（`skipped` は飛ばした段の印を付ける。上の「飛ばした段の印の決まり」）、`stopped` は動かさない。
  条件に合わない呼び出し（範囲が無い・`pending`・一足飛び・済んだ段・`count` が範囲の段の数と違う）も差し戻さず、帯を動かさない。
  受け付けた呼び出しの `count` は「返却で知らされた段の数」として、後の `work_plan` の範囲の差し戻しに使う
- 帯を動かす判定は handler が行い、帯を動かしたときだけ、結果を読んだ形の返却のイベントを1件流す（画面の帯はそれで動く）
- 戻り値は `work_plan` と同じく `ok` の次の行に帯の今の段（「帯の今の段は 本 2/2 段の名前。…」）。帯を動かさなかったときは、その行の頭に「帯は動いていない。」を付ける
- `phase_result` は要約を持たない。返却で済んだ段のまとめは、返却のあとメインが同じ位置で呼ぶ `work_plan` の `phaseSummary` に書く（`phase_result` で進んだ位置でも省けない）。
  まとめの空のまま返却で済んだ段は**まとめ待ちの段**になり、次に受け付けた `work_plan` が `phaseSummary` を持ち、その段がまだ済んでいれば、そのまとめをその段の中間レポートにする。
  まとめ待ちの段は1つだけ覚えるので、メインの `work_plan` の前に `phase_result` が2件続けて段を済ませると（並列の段）、先の段はまとめ待ちから外れ、中間レポートが出ない
- 計画だけの回は `phase_result` を呼ばない（計画だけの回の返却で範囲の差し戻しは掛からない）。段の数はメインが Beads から読んで `delegatedRange` の `count` に渡す
- 委譲ゲートは今までどおり `SubagentHandback` の返却で立つ。`phase_result` は許可モードによらず呼べるので、`<task-notification>` で返る委譲でも帯は進む（委譲ゲートは立たない）

## してよいこと

- 口を呼ぶ: メインが `work_plan` で段を進め、`report` で結果と段の閉じ方を渡す
- 委譲先に `phase_result` を呼ばせる（上の「スキルの契約」）。委譲中の段はその呼び出しで tsukumo が進め、メインの `work_plan` は並びと `delegatedRange` を渡す。
  `phase_result` を呼ばない委譲先（古い plugin・計画だけの回）では、ワークプランを渡した依頼なら返却のたびに委譲ゲートが立つので、メインが `work_plan` で段を進める
- Beads の組み込みの欄に書く（題・本文・依存・状態など）

tsukumo が読まないもの: 委譲の返却の本文、委譲先の `SendMessage` の合図、スキルの道具（着手の印・検証の見張り）、
課題の本文の書式、委譲の依頼文、ファイルの置き場、ワークフローの設定ファイル（`.tw/config.toml`。見せて書くのは `docs/architecture/workflow-contract/config-and-beads.md`「設定コマンド」だけ）。
ワークフローが段を帯に出したければ、メインにこの口を呼ばせる。

## 合わせ方

独自のワークフローが合わせる相手はこの節で、`tsukumo-plugins` のものも同じ立場。ワークフローの置き場は
`sinnlosses/tsukumo-plugins` で、tsukumo はそれをコミット単位で固定して取り込む（経緯と決めたことは ADR 0024）。
素の Claude Code では利用者の手元のワークフローを使い、tsukumo の中では取り込んだものを使う。
独自のワークフローも、`docs/architecture/workflow-contract/config-and-beads.md`「設定コマンド」の2つのコマンドを持てば、歯車の設定から並びを選べる。
並びに置くスキルを書くときは、上の「スキルの契約」の印を付け、受け取るもの・返すものを合わせる。

取り込んだワークフローを載せるとき（`mount`・`partial`）は、plugin の `hooks/hooks.json` が `AskUserQuestion` に `tw ask-guard` を当てる。
利用者がスキルとエージェントをリンクで入れていて載せないとき（`user-installed`）は、Claude Code が `PreToolUse` の `AskUserQuestion` に利用者側の `tw ask-guard`（`TSUKUMO_TW` があればそのパス）を当てる。
どちらか一方だけが効き、二重に拒まない。子が失敗・無出力・読めない出力のときは質問を通す。`report` の `favor` は扱わない。

段の自動記録も同じ切り分けで当たる。載せるときは plugin の `hooks/hooks.json` が `SubagentStart` と `Skill` の `PreToolUse` に `tw lap-hook` を当てる。
`user-installed` のときは Claude Code が `SubagentStart` と matcher `Skill` の `PreToolUse` に利用者側の `tw lap-hook`（`TSUKUMO_TW` があればそのパス）を当てる。
どちらか一方だけが効き、二重に lap を書かない。どの入力で段を書くかは `lap-hook` が決め、tsukumo は入力をそのまま渡す。
子が失敗・タイムアウトしても会話を止めず、子の出力は hook の結果に写さない。
