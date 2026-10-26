# ワークフローの契約

ステータス: **正典**。

責務: tsukumo がワークフロー（タスクを段に分けて送り出す手順）に対して定める契約 — 受ける口の名前と引数の意味、
委譲の返却の書式と委譲ゲート、読む Beads の欄、ワークフローが持つ設定コマンド、並びに置くスキルの契約、ワークフローがしてよいことと tsukumo が読まないもの — を1か所に持つ。
読む時: 独自のワークフローを tsukumo に当てるとき、`tsukumo-plugins` のワークフローを直すとき、口の引数や Beads アダプタ・設定コマンドを変えるとき、並びに置くスキルを書くとき。
直す時: 口の引数・委譲の返却の書式と帯の進め方・委譲ゲート・Beads の読み取る欄・設定コマンドの形・スキルの契約・読まないものを変えたとき。判断の経緯は
`docs/architecture/adr/0024-no-skill-dependency.md`（並びの話は `docs/architecture/adr/0030-workflow-as-skill-sequence.md`）、帯・中間レポートの描き方と差し戻しは `docs/architecture/display.md`「ワークプラン」が持つ。

## このファイルの読み方

「契約とは何か」はこのファイルにあり、ほかの節の本文は子のファイル（`docs/architecture/workflow-contract/`）にある。下の目次で子を1つ特定し、その子のファイルを丸ごと読む。

## 目次

この表は `pnpm run format` が子のファイルの責務の行から書き直すので、手で直さない。

| ファイル                                                  | 説明                                                                                                                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/architecture/workflow-contract/config-and-beads.md` | tsukumo が読む Beads の欄と、ワークフローが持つ設定コマンド（`tw config --schema`・`tw config set`）の形と tsukumo の使い方を持つ。                                            |
| `docs/architecture/workflow-contract/port-and-return.md`  | tsukumo がワークフローから受ける2つの口（`work_plan`・`report`）の名前と引数の意味、委譲先の返却（`phase_result`）での帯の進め方、委譲ゲートを持つ。                           |
| `docs/architecture/workflow-contract/skill-sequence.md`   | 並びに置くスキルの印・受け取るもの・返すもの、返却のツール `phase_result`、ワークフローがしてよいことと tsukumo が読まないもの、利用者独自のワークフローが合わせる相手を持つ。 |

## 契約とは何か

**契約は、タスクに段があり、並列に走る部分があり、それがパイプラインのように流れることを受ける口。** tsukumo が定めるのは
この口と、委譲先の返却のツール `phase_result` と、読む Beads の欄と、ワークフローが持つ設定コマンドと、並びに置くスキルの契約だけで、ワークフローの手順・道具・それ以外の書式は定めない。

契約を満たすワークフローは、`tsukumo-plugins` のものも利用者独自のものも同じ立場で tsukumo に当てられる。
`tsukumo-plugins` のものは契約に型の合う1つの例で、tsukumo の一部ではない。core は契約だけを見る。
