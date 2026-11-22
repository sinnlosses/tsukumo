# ワークフローの契約: スキルの並び

ステータス: **正典**。入口は `docs/architecture/workflow-contract.md`（ワークフローの契約の全体）。

責務: 部品（並びに置くスキル、作り手の契約は `docs/architecture/workflow-contract/step-part.md`）を並びに載せて走らせる側の決まり（並びの候補・置ける位置・段を走らせる agent）、返却のツール `phase_result` の引数と段の解き方、ワークフローがしてよいことと tsukumo が読まないもの、利用者独自のワークフローが合わせる相手を持つ。
読む時: 独自のワークフローを tsukumo に当てる、`phase_result` や飛ばしたフェーズの印を直すとき。
直す時: 並びの候補・`phase_result` の引数と解き方・読まないもの・合わせ方を変えたとき。

## スキルの契約

**ワークフローは、契約を満たす段の並び（schema 2 の `steps`）。** 並びの要素はスキルの全名か、ワークフロースクリプトの段の名前。エージェントは段が中で使う道具として並びに出さない。
並びは線形で、近道・`loopable`・メインで行うのような分岐は並びで表さず、各段が「飛ばした」と返す。並びの中の並列は持たない（フェーズの中の並列は段の中で行う）。
並びを読んで順に呼ぶのはワークフローのオーケストレーターで、tsukumo は並びを読まない。プログレスバーは今までどおりメインの `work_plan` で受ける。
tsukumo が並びに課す縛りは「1つ以上」だけで、送り出しのスキルも並びの1つとして外せる。
この節は schema 2 の契約で、`phase_result` と `work_plan` の `skippedPhases` は入っており、飛ばしたフェーズのプログレスバーでの描き方は `docs/architecture/display.md`「ワークプラン」に入っている。経緯と採らなかった案は `docs/architecture/adr/0030-workflow-as-skill-sequence.md`。

**部品（並びに差し込むスキル）の印・受け取るもの・返すものは `docs/architecture/workflow-contract/step-part.md` が持つ。** ここはその部品を並びに載せて走らせるオーケストレーターの側の決まりを書く。

- **並びの候補**: `tw config --schema` の `steps` の `values` は、組み込みの3段（`implement`・`accept`・`retrospect`）の後ろに、印（`workflow-step`）のあるスキルが入る。`value` は Skill ツールで呼ぶ全名（plugin のスキルは `<プラグイン>:<名前>`）、`label` は frontmatter の `name`、`title` は `workflow-step-title`（無ければ `label`）、`description` は frontmatter の `description`。印を拾うのは `tw` で、tsukumo は frontmatter を読まない
- **置ける位置**: `implement` より前には置けない（`tw config set` が終了コード2で断る）。候補にも組み込みにも無い値（スキルを消した・別の作業ツリーにしか無い）は `tw plan-phases` が段にしない
- **走らせる agent**: 独自の段は段ごとに新しい agent（`step-runner`）を1体起こし、スキルを Skill ツールでタスクの ID を引数に呼ばせる。agent はスキルが最後に返した結果の語を `phase_result` と返却の schema へ写す。部品は `phase_result` を呼ばない
- **前段の結果と再開の位置**: Beads の欄から読む。どの欄・節に書くかはワークフローが決め、tsukumo は `docs/architecture/workflow-contract/config-and-beads.md`「Beads の欄」のほかは読まない。止まったフェーズから再開するための位置も、ワークフローが Beads に残す

結果の語は3つ（`finished`・`skipped`・`stopped`）で、結果の中身（何をしたか・何が分かったか）は Beads に書き、返す値には入れない。並びとプログレスバーの扱いは次の表。

| 結果       | 意味                                                                | 並びとプログレスバー                                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `finished` | フェーズを済ませた                                                  | 次のスキルへ進む。プログレスバーのフェーズを済ませる                                                                                                                                            |
| `skipped`  | フェーズを飛ばした（近道・`loopable` などでこのフェーズが要らない） | 次のスキルへ進む。プログレスバーのフェーズを飛ばしたフェーズとして済ませる。どちらの経路から返してもプログレスバーは同じになる（描き方は `docs/architecture/display.md`「ワークプラン」が持つ） |
| `stopped`  | フェーズの途中で止めた。理由を添える                                | 並び全体を止め、後のスキルを呼ばない。プログレスバーは止まったフェーズが「今」のまま残る。同じタスクを呼び直すと止まったフェーズから再開する                                                    |

返す経路は、フェーズがどこで走るかで2つある。どちらも許す:

- **メインで走るフェーズ**: `finished`・`skipped` は `work_plan` で次の位置へ進め、`phaseSummary` にフェーズのまとめ（`skipped` なら飛ばしたわけ）を書く。
  `skipped` は、そのフェーズの名前を `skippedPhases` に入れる。`stopped` は `report` の `workPlanClosing` に `stopped` を渡す
- **委譲先で走るフェーズ**: 委譲先が `SubagentHandback` の前に `phase_result` を呼ぶ。フェーズのまとめは `finished` の任意の欄 `summary`（1〜2文）で渡せて、渡したフェーズはメインの `phaseSummary` が要らない
  （結果の中身は Beads に書く決まりは変わらず、`summary` はプログレスバーの中間レポートに出す1〜2文だけ）

**並びの値は、スキルの全名でも、ワークフロースクリプト（plugin の `workflows/` の `Workflow`）のフェーズの名前でもよい。**
ワークフロースクリプトは段ごとにスキルを呼ぶ代わりに、ワークフロースクリプトの中の委譲先にフェーズごとの `phase_result` を呼ばせてプログレスバーを進める（`docs/architecture/workflow-contract/port-and-return.md`「委譲の返却」。完了の知らせを受けたメインの扱いは `docs/architecture/display/work-plan-host-rule.md`）。
tsukumo はワークフロースクリプトのフェーズの名前や委譲先の数を読まない。

飛ばしたフェーズの印の決まり（どちらの経路でも、印の付いたフェーズはプログレスバーで同じに描く）:

- **メインで走るフェーズの `skipped`**: `work_plan` の `skippedPhases` に入れたフェーズに印が付く。`skippedPhases` には、その呼び出しで済んでいるフェーズの名前だけを入れ、毎回の呼び出しで、メインが飛ばしたフェーズをすべて渡す
- **委譲先で走るフェーズの `skipped`**: 受け付けた `phase_result` がフェーズを済ませるときに印が付く。メインはそのフェーズを `skippedPhases` に入れなくてよく（入れてもよい）、入れなくても印は消えない
- 差し戻す判定（済ませたフェーズをあとから飛ばしたにしない・外したら差し戻す・範囲の外のフェーズに印を付けない・組み直しで戻らない）は `docs/architecture/display/work-plan-host-rule.md`「飛ばしたフェーズの印の差し戻し」
- `skippedPhases` もフェーズを1つずつ進める決まりに従う。飛ばしたフェーズも済んだフェーズに数え、`phaseSummary` に飛ばしたわけを書く

**プログレスバーのフェーズの名前・位置・範囲の正しさは、ワークフロー側が機械的に決めて検査する。** メインが自分で書くのは `phaseSummary` だけにし、それを保証するのはワークフローの責務。
tsukumo の `work_plan` が見るのは、呼び出しの中と呼び出しどうしの辻褄（上の差し戻し）だけで、ワークフローの期待値（正しいフェーズの名前・最初の位置）とは照らさない。
最初の呼び出しの位置（`current > 0`）も差し戻さない。理由は2つ。(1) 最初の呼び出しが途中の位置で始まるのは、再開と前の依頼から続く並びで正当に起きるので、
`current > 0` だけを差し戻すと再開が通らない。(2) 正しい名前と位置はワークフローの記録（`tw` なら `tw plan-phases`）にしか無く、tsukumo はそれを読まない（`docs/architecture/adr/0024-no-skill-dependency.md`）。
ワークフローが検査するなら、`work_plan` の `PreToolUse` のフック（`mcp__tsukumo__work_plan`。許可モードによらず毎回呼ばれる）で、引数を自分の期待値と照らして拒む。

`phase_result`（構造化した返却。委譲先がフェーズごとに1回呼ぶ）:

| 引数      | 意味                                                                                                                                          |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `step`    | 結果を返すフェーズの id。`work_plan` の `phases` の id に無ければ差し戻す。省くとワークフロースクリプトの agent はその agent のフェーズで補う |
| `outcome` | `finished`・`skipped`・`stopped`（上の表）                                                                                                    |
| `reason`  | 止めた理由を1〜2文で。`outcome` が `stopped` のときだけ渡す                                                                                   |
| `summary` | フェーズのまとめを1〜2文で。`outcome` が `finished` のときだけ渡す                                                                            |
| `phase`   | 結果を返す委譲先のフェーズの番号（1始まり）。`delegatedRange` の範囲の中の番号。互換。`step` があれば `step` を使う                           |
| `count`   | 委譲先のフェーズの数。互換。`step` があれば `step` を使う                                                                                     |

結果を返す段は、次の順で1つに決まる。決まった段が今の段の集合にあれば済ませ、無ければ動かさない。

1. `step` があれば、その id の段（`phases` の id に無ければ差し戻す）
2. `step` が無く、呼んだ agent がワークフロースクリプトの写しにいれば、その agent の段（`PreToolUse` のフックが `agent_id` から引いて `step` に書き足す）
3. どちらも無ければ、互換の `phase`・`count` と `delegatedRange` の範囲で解く（古い依頼文・`Agent` で委譲するワークフロー）。`step` と `phase` の両方があれば `step` を使う

1体で複数の段を返す委譲先（実装役）は `step`（`impl-<n>`）を渡す。受け入れ・振り返り・独自の段の agent は1体が1段なので渡さない。

- 受け付けた呼び出しは、`docs/architecture/workflow-contract/port-and-return.md`「プログレスバーの進め方」の条件でプログレスバーを動かす。`finished`・`skipped` は上の順で決まった段のプログレスバーのフェーズを済ませ（`skipped` は飛ばしたフェーズの印を付ける。上の「飛ばしたフェーズの印の決まり」）、`stopped` は動かさない。
  受け付けた呼び出しの `count` は「返却で知らされたフェーズの数」として、後の `work_plan` の範囲のフェーズの数の確定に使う。
  引数の検査・差し戻しの文面・動かさない条件は `docs/architecture/display/work-plan-host-rule.md`「phase_result の差し戻しと動かさない条件」
- `phase_result` の `finished` が `summary` を持てば、その文がフェーズのまとめになり、メインの `work_plan` は `phaseSummary` を要らない。持たないときの扱いはメインを縛る決まりに従う
- 計画だけの回は `phase_result` を呼ばない。フェーズの数はメインが Beads から読んで `delegatedRange` の `count` に渡す

## してよいこと

- ツールを呼ぶ: メインが `work_plan` でフェーズを進め、`report` で結果とフェーズの閉じ方を渡す
- 委譲先に `phase_result` を呼ばせる（上の「スキルの契約」）。委譲中のフェーズはその呼び出しで tsukumo が進め、メインの `work_plan` は並びと `delegatedRange` を渡す。
  `phase_result` を呼ばない委譲先（古い plugin・計画だけの回）では、メインが `work_plan` でフェーズを進める（返却を受けたメインを縛る決まりは `docs/architecture/display/work-plan-host-rule.md`）
- Beads の組み込みの欄に書く（題・本文・依存・状態など）

tsukumo が読まないもの: 委譲の返却の本文、委譲先の `SendMessage` の通知、スキルの道具（着手の印・検証の見張り）、
課題の本文の書式、委譲の依頼文、ファイルの置き場、ワークフローの設定ファイル（`.tw/config.toml`。見せて書くのは `docs/architecture/workflow-contract/config-and-beads.md`「設定コマンド」だけ）。
ワークフローがフェーズをプログレスバーに出したければ、メインにこのツールを呼ばせる。

## 合わせ方

独自のワークフローが合わせる相手はこの節で、`tsukumo-plugins` のものも同じ立場。ワークフローの置き場は
`sinnlosses/tsukumo-plugins` で、tsukumo はそれをコミット単位で固定して取り込む（経緯と決めたことは ADR 0024）。
素の Claude Code では利用者の手元のワークフローを使い、tsukumo の中では取り込んだものを使う。
独自のワークフローも、`docs/architecture/workflow-contract/config-and-beads.md`「設定コマンド」の2つのコマンドを持てば、歯車の設定から並びを選べる。
並びに置くスキルを書くときは、上の「スキルの契約」の印を付け、受け取るもの・返すものを合わせる。

取り込んだワークフローを載せるとき（`mount`・`partial`）は、plugin の `hooks/hooks.json` が `AskUserQuestion` に `tw ask-guard` を当てる。
利用者がスキルとエージェントをリンクで入れていて載せないとき（`user-installed`）は、Claude Code が `PreToolUse` の `AskUserQuestion` に利用者側の `tw ask-guard`（`TSUKUMO_TW` があればそのパス）を当てる。
どちらか一方だけが効き、二重に拒まない。子が失敗・無出力・読めない出力のときは質問を通す。`report` の `favor` は扱わない。

フェーズの自動記録も同じ切り分けで当たる。載せるときは plugin の `hooks/hooks.json` が `SubagentStart` と `Skill` の `PreToolUse` に `tw lap-hook` を当てる。
`user-installed` のときは Claude Code が `SubagentStart` と matcher `Skill` の `PreToolUse` に利用者側の `tw lap-hook`（`TSUKUMO_TW` があればそのパス）を当てる。
どちらか一方だけが効き、二重に lap を書かない。どの入力でフェーズを書くかは `lap-hook` が決め、tsukumo は入力をそのまま渡す。
子が失敗・タイムアウトしても会話を止めず、子の出力は hook の結果に写さない。
