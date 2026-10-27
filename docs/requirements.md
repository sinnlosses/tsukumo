# tsukumo 要件定義

ステータス: **正典**（未決事項は「7. 未決事項」）。**4.2「表示」は `docs/architecture/display.md` へ、
4.9「雑談モード」は `docs/architecture/chat-mode.md` へ移した**（節の番号はそのまま）。この
ファイルの中でファイル名を添えずに `4.2` や `4.9` のように書いた番号は、それぞれそちらの節を
指す。

責務: やること・やらないこと・技術制約・未決事項を定める要件定義。4.2「表示」と4.9「雑談モード」は
`docs/architecture/` 側へ移し、この文書は要件の骨格だけを持つ。
読む時: 要件・やらないこと・技術制約・未決事項を知りたいとき。
直す時: 要件を追加・変更したとき、未決事項を解決したとき。

## このドキュメントの読み方

### このファイルは通読しない

節の本文は子のファイル（`docs/requirements/`）にある。下の目次で子を1つ特定し、その子のファイルを丸ごと読む。
このファイルに本文があるのは「正典に残すもの・`docs/history/` へ移すもの」「4. 機能要件」の欠番の注記「7. 未決事項」「8. 参照」だけ。

### 正典に残すもの・`docs/history/` へ移すもの

**このファイルと `docs/architecture.md` には「いまどうなっているか」だけを書く。** そこへ至った
経緯・比較・実測は `docs/history/` に置き、正典からは1行で参照する。

| 種類                   | 正典に残すもの                         | `docs/history/` へ移すもの |
| ---------------------- | -------------------------------------- | -------------------------- |
| 却下した案・撤去した案 | 「この案は採らない」の1行と参照        | 理由・比較・実測           |
| 値の根拠               | 決めた値と、**その値を見直すべき条件** | 測り方と数字               |
| 覆した・差し戻した決定 | **いまの形だけ**                       | 覆った記録と、その理由     |

**代償を承知で選んでいる**（ユーザーの選択。以前は3種類とも正典に残していた）:
却下した案を再提案しようとした人は**もう1ファイル開く**ことになり、値を疑ったときに数字が
手元に無く、一度往復した決定（吹き出しの位置・Enter の割り当て）を踏み直す余地が戻る。それでも
**正典が現状だけを映すこと**を優先する。

## 目次

この表は `pnpm run format` が子のファイルの責務の行から書き直すので、手で直さない。

| ファイル                                          | 説明                                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `docs/requirements/achievement-reflection.md`     | 4.11 成果の振り返りの後半。                                                                              |
| `docs/requirements/achievement.md`                | 4.11 成果の振り返りの前半。                                                                              |
| `docs/requirements/character-pack.md`             | 4.4 キャラクターパック（素材と表情の対応の差し替え、画面から変える・作る・消す）。                       |
| `docs/requirements/claude-code-driving.md`        | 4.1 Claude Code の駆動（SDK の `query` の動かし方と、受け取るイベントの行き先）。                        |
| `docs/requirements/constraint-and-environment.md` | 3. 技術制約（TUI を使わず SDK で動かす理由）、5. 実行環境・非機能要件。                                  |
| `docs/requirements/expression.md`                 | 4.3 状態連動の前半。                                                                                     |
| `docs/requirements/image-attachment.md`           | 4.10 画像の添付（入力欄に画像を添える道。                                                                |
| `docs/requirements/launch-and-setting.md`         | 4.6 起動と設定（1コマンドでの起動と、既存設定を壊さない制約）。                                          |
| `docs/requirements/portrait-motion.md`            | 4.3 状態連動の後半。                                                                                     |
| `docs/requirements/purpose-and-scope.md`          | 1. 概要・目的、2. スコープ（やること・やらないこと・想定利用者）、6. 既存のものとの関係。                |
| `docs/requirements/screen-layout.md`              | 4.7 画面レイアウト（biim 風の4領域、1枚の HTML にまとめた形、狭い画面での見せ方）。                      |
| `docs/requirements/session-restore-condition.md`  | 4.8 セッションの復元の後半。                                                                             |
| `docs/requirements/session-restore.md`            | 4.8 セッションの復元の前半。                                                                             |
| `docs/requirements/token-usage-review.md`         | 4.12 トークン消費の見直し（見直しの2つのツール、見直しの寿命、提案の識別子と実行、見送りと前回の結果）。 |

## 4. 機能要件

4.5（statusline 併走）は前提が消えて削除した欠番で、記録は `docs/history/decision.md`「requirements.md 7. 未決事項」にある。

## 7. 未決事項

決まっていないことは、ここに表で未決のまま残す（決まったらこの節から本文へ移す）。
いまは無い。対応するタスクは Beads の課題。

**決まって本文へ移したもの・前提ごと消えたものの記録**は
`docs/history/decision.md`「requirements.md 7. 未決事項」。

## 8. 参照

- 採用アーキテクチャと、採らなかった案: [`docs/architecture.md`](./architecture.md)
- 用語の定義: [`docs/glossary.md`](./glossary.md)
- コーディング規約: [`docs/coding-standards.md`](./coding-standards.md)
- 外に依存しているものの洗い出しと「外せるか」の評価: [`docs/research/external-dependency.md`](./research/external-dependency.md)
