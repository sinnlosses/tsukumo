# ワークフローの契約

最終更新: 2026-10-15。ステータス: **正典**。

責務: tsukumo がワークフロー（タスクを段に分けて送り出す手順）に対して定める契約 — 受ける口の名前と引数の意味、
委譲の返却の書式と委譲ゲート、読む Beads の欄、ワークフローが持つ設定コマンド、並びに置くスキルの契約、ワークフローがしてよいことと tsukumo が読まないもの — を1か所に持つ。
読む時: 独自のワークフローを tsukumo に当てるとき、`tsukumo-plugins` のワークフローを直すとき、口の引数や Beads アダプタ・設定コマンドを変えるとき、並びに置くスキルを書くとき。
直す時: 口の引数・委譲の返却の書式と帯の進め方・委譲ゲート・Beads の読み取る欄・設定コマンドの形・スキルの契約・読まないものを変えたとき。判断の経緯は
`docs/architecture/adr/0024-no-skill-dependency.md`（並びの話は `docs/architecture/adr/0030-workflow-as-skill-sequence.md`）、帯・中間レポートの描き方と差し戻しは `docs/architecture/display.md`「ワークプラン」が持つ。

本文は3つの子のファイルに分けてある（「契約とは何か」はここに残す）。節の見出しはここに残し、中身は移し先を引く。

- `docs/architecture/workflow-contract/port-and-return.md`: 口、委譲の返却
- `docs/architecture/workflow-contract/skill-sequence.md`: スキルの契約、してよいこと、合わせ方
- `docs/architecture/workflow-contract/config-and-beads.md`: Beads の欄、設定コマンド

## 節の索引

| 節              | 中身                                                   |
| --------------- | ------------------------------------------------------ |
| ## 契約とは何か | 契約が受けるもの、型の合うワークフローの立場           |
| ## 口           | 3つの口の名前と引数の意味                              |
| ## 委譲の返却   | `phase_result` での帯の進め方、委譲ゲート              |
| ## Beads の欄   | 読む欄と、読まないもの                                 |
| ## 設定コマンド | ワークフローが持つ2つのコマンドと、tsukumo の使い方    |
| ## スキルの契約 | 並びのスキルの印・受け取るもの・返すもの、返却のツール |
| ## してよいこと | ワークフローが呼んでよい口と、tsukumo が読まないもの   |
| ## 合わせ方     | 利用者独自のワークフローが合わせる相手、置き場         |

## 契約とは何か

**契約は、タスクに段があり、並列に走る部分があり、それがパイプラインのように流れることを受ける口。** tsukumo が定めるのは
この口と、委譲先の返却のツール `phase_result` と、読む Beads の欄と、ワークフローが持つ設定コマンドと、並びに置くスキルの契約だけで、ワークフローの手順・道具・それ以外の書式は定めない。

契約を満たすワークフローは、`tsukumo-plugins` のものも利用者独自のものも同じ立場で tsukumo に当てられる。
`tsukumo-plugins` のものは契約に型の合う1つの例で、tsukumo の一部ではない。core は契約だけを見る。

## 口

本文は `docs/architecture/workflow-contract/port-and-return.md`「口」。

## 委譲の返却

本文は `docs/architecture/workflow-contract/port-and-return.md`「委譲の返却」。

## Beads の欄

本文は `docs/architecture/workflow-contract/config-and-beads.md`「Beads の欄」。

## 設定コマンド

本文は `docs/architecture/workflow-contract/config-and-beads.md`「設定コマンド」。

## スキルの契約

本文は `docs/architecture/workflow-contract/skill-sequence.md`「スキルの契約」。

### 飛ばした段の印の決まり

本文は `docs/architecture/workflow-contract/skill-sequence.md`「スキルの契約」の「飛ばした段の印の決まり」。

## してよいこと

本文は `docs/architecture/workflow-contract/skill-sequence.md`「してよいこと」。

## 合わせ方

本文は `docs/architecture/workflow-contract/skill-sequence.md`「合わせ方」。
