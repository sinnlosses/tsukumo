# tsukumo 要件定義

最終更新: 2026-10-04
ステータス: **ドラフト**（未決事項は「7. 未決事項」）。**4.2「表示」は `docs/architecture/display.md` へ、
4.9「雑談モード」は `docs/architecture/chat-mode.md` へ移した**（2026-09-23。節の番号はそのまま）。この
ファイルの中でファイル名を添えずに `4.2` や `4.9` のように書いた番号は、それぞれそちらの節を
指す。

責務: やること・やらないこと・技術制約・未決事項を定める要件定義。4.2「表示」と4.9「雑談モード」は
`docs/architecture/` 側へ移し、この文書は要件の骨格だけを持つ。
読む時: 要件・やらないこと・技術制約・未決事項を知りたいとき。
直す時: 要件を追加・変更したとき、未決事項を解決したとき。

## このドキュメントの読み方

### このファイルは通読しない

このファイルは見出しと索引だけで、節の本文は子のファイル（`docs/requirements/`）にある。
下の索引で節を1つ特定し、索引の下の一覧から**その節の子のファイルだけ**を開いて読む
（このファイルから本文を切り出さない。子のファイルは冒頭に自分の節の索引を持つ）。

### 節の索引

**索引の行は本文の `##` / `###` の節と1対1**（節を足したり消したりしたら、ここも同じ数だけ
動かす。`grep -c '^#\{2,3\} ' docs/requirements.md` と行数が合う）。

| 節                                             | 中身                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| ## このドキュメントの読み方                    | 読み方と、正典に何を残すか                                                            |
| ### このファイルは通読しない                   | 索引で節を特定し、その子のファイルだけを開く読み方                                    |
| ### 節の索引                                   | この表                                                                                |
| ### 正典に残すもの・`docs/history/` へ移すもの | **現状だけを正典に置く**物差しと、その代償                                            |
| ## 1. 概要・目的                               | **何のために作るのか**。目的と手段の区別。機能を足す前にここを見る                    |
| ### 合格シーン（v1）                           | **どうなったら合格か**。機能を足すかどうかはここに近づくかで決める                    |
| ### 「ターミナル環境」とは何を指すか           | 道具立てはターミナル、表示は HTML。ホストは Orca か既定のブラウザ                     |
| ### 実現の手段                                 | tsukumo が Agent SDK で Claude Code を動かす                                          |
| ## 2. スコープ                                 | やること・やらないこと・想定利用者                                                    |
| ### 2.1 対象とすること                         | やること                                                                              |
| ### 2.2 対象外とすること                       | **やらないこと**。機能を足そうとする前にここを見る                                    |
| ### 2.3 想定利用者                             | 個人利用であること、Orca と既定のブラウザが並ぶ環境、作者の運用が無い環境での振る舞い |
| ## 3. 技術制約                                 | **TUI を使わず SDK で動かす理由**。設計を疑う前にここ                                 |
| ## 4. 機能要件                                 | 4.1〜4.12 の親見出し                                                                  |
| ### 4.1 Claude Code の駆動                     | SDK の `query` の動かし方と、受け取るイベントの行き先                                 |
| ### 4.3 状態連動                               | **表情の一覧と出す場面**（源は `speak` の引数だけ）、立ち絵の動き                     |
| ### 4.4 キャラクターパック                     | 素材の差し替え可能性                                                                  |
| ### 4.6 起動と設定                             | 1コマンドでの起動と、既存設定を壊さない制約                                           |
| ### 4.7 画面レイアウト                         | biim 風の4領域。1枚のHTMLにまとめた形と、狭い画面での見せ方                           |
| ### 4.8 セッションの復元                       | 起こし直したときに**何を戻し何を戻さないか**。鍵・契機・保存しない理由                |
| ### 4.10 画像の添付                            | 入力欄に画像を添える道。SDK 側の裏取り・上限・見え方・原寸を持たない形                |
| ### 4.11 成果の振り返り                        | 終えたタスクを日ごとに数える規則、卒業・節目・灯り、日記と振り返りの依頼              |
| ### 4.12 トークン消費の見直し                  | 見直しの2つのツール、見直しの寿命、提案の識別子と実行、見送りと前回の結果             |
| ## 5. 実行環境・非機能要件                     | 実行時の依存、Orca に依存してよい範囲、会話内容の扱い                                 |
| ## 6. 既存のものとの関係                       | 先行事例と、空いている穴                                                              |
| ## 7. 未決事項                                 | まだ決まっていないこと（対応するタスクID付き）                                        |
| ## 8. 参照                                     | 関連ドキュメントへのリンク                                                            |

本文は 14 の子のファイル（`docs/requirements/`）に分けてある。節の見出しはここに残し、中身は移し先を引く。

- `docs/requirements/purpose-and-scope.md`: 1. 概要・目的、2. スコープ、6. 既存のものとの関係
- `docs/requirements/constraint-and-environment.md`: 3. 技術制約、5. 実行環境・非機能要件
- `docs/requirements/claude-code-driving.md`: 4.1 Claude Code の駆動
- `docs/requirements/expression.md`: 4.3 状態連動の前半（表情の一覧と出す場面、表情の源、黙って立つだけの場面の埋め方）
- `docs/requirements/portrait-motion.md`: 4.3 状態連動の後半（立ち絵の動き、書き上げの演出とミニ立ち絵）
- `docs/requirements/character-pack.md`: 4.4 キャラクターパック
- `docs/requirements/launch-and-setting.md`: 4.6 起動と設定
- `docs/requirements/screen-layout.md`: 4.7 画面レイアウト
- `docs/requirements/session-restore.md`: 4.8 セッションの復元の前半（何を戻し何を戻さないか、保存しない理由、鍵）
- `docs/requirements/session-restore-condition.md`: 4.8 セッションの復元の後半（別の窓で使用中のセッション、いつ復元するか、復元できなかったとき）
- `docs/requirements/image-attachment.md`: 4.10 画像の添付
- `docs/requirements/achievement.md`: 4.11 成果の振り返りの前半（数える規則、数えられないとき、卒業と節目、灯り、日記）
- `docs/requirements/achievement-reflection.md`: 4.11 成果の振り返りの後半（振り返りの依頼）
- `docs/requirements/token-usage-review.md`: 4.12 トークン消費の見直し

### 正典に残すもの・`docs/history/` へ移すもの（2026-09-21 決定）

**このファイルと `docs/architecture.md` には「いまどうなっているか」だけを書く。** そこへ至った
経緯・比較・実測は `docs/history/` に置き、正典からは1行で参照する。

| 種類                   | 正典に残すもの                         | `docs/history/` へ移すもの |
| ---------------------- | -------------------------------------- | -------------------------- |
| 却下した案・撤去した案 | 「この案は採らない」の1行と参照        | 理由・比較・実測           |
| 値の根拠               | 決めた値と、**その値を見直すべき条件** | 測り方と数字               |
| 覆した・差し戻した決定 | **いまの形だけ**                       | 覆った記録と、その理由     |

**代償を承知で選んでいる**（2026-09-21 ユーザーの選択。それ以前は3種類とも正典に残していた）:
却下した案を再提案しようとした人は**もう1ファイル開く**ことになり、値を疑ったときに数字が
手元に無く、一度往復した決定（吹き出しの位置・Enter の割り当て）を踏み直す余地が戻る。それでも
**正典が現状だけを映すこと**を優先する。

## 1. 概要・目的

本文は `docs/requirements/purpose-and-scope.md`。

### 合格シーン（v1）

本文は `docs/requirements/purpose-and-scope.md`。

### 「ターミナル環境」とは何を指すか

本文は `docs/requirements/purpose-and-scope.md`。

### 実現の手段

本文は `docs/requirements/purpose-and-scope.md`。

## 2. スコープ

### 2.1 対象とすること

本文は `docs/requirements/purpose-and-scope.md`。

### 2.2 対象外とすること（スコープ外）

本文は `docs/requirements/purpose-and-scope.md`。

### 2.3 想定利用者

本文は `docs/requirements/purpose-and-scope.md`。

## 3. 技術制約

本文は `docs/requirements/constraint-and-environment.md`。

## 4. 機能要件

### 4.1 Claude Code の駆動

本文は `docs/requirements/claude-code-driving.md`。

### 4.3 状態連動

本文は `docs/requirements/expression.md`（表情）と `docs/requirements/portrait-motion.md`（立ち絵の動き）。

### 4.4 キャラクターパック

本文は `docs/requirements/character-pack.md`。

### 4.6 起動と設定

本文は `docs/requirements/launch-and-setting.md`。

### 4.7 画面レイアウト

本文は `docs/requirements/screen-layout.md`。

### 4.8 セッションの復元

本文は `docs/requirements/session-restore.md`（何を戻すか・保存しない理由・鍵）と `docs/requirements/session-restore-condition.md`（使用中・いつ復元するか・できなかったとき）。

#### 何を戻し、何を戻さないか

本文は `docs/requirements/session-restore.md`。

#### tsukumo 側に会話を保存しない

本文は `docs/requirements/session-restore.md`。

#### 鍵（切り替え先の一覧に何を出すか）

本文は `docs/requirements/session-restore.md`。

#### 別の窓で使用中のセッション

本文は `docs/requirements/session-restore-condition.md`。

#### いつ復元するか

本文は `docs/requirements/session-restore-condition.md`。

#### 復元できなかったときどうするか

本文は `docs/requirements/session-restore-condition.md`。

### 4.10 画像の添付

本文は `docs/requirements/image-attachment.md`。

#### 渡せることの裏取り

本文は `docs/requirements/image-attachment.md`。

#### 受け取り方

本文は `docs/requirements/image-attachment.md`。

#### 上限

本文は `docs/requirements/image-attachment.md`。

#### 画面での見え方

本文は `docs/requirements/image-attachment.md`。

#### 会話内容の扱い（この機能の形そのもの）

本文は `docs/requirements/image-attachment.md`。

#### ファイルは覆さない理由

本文は `docs/requirements/image-attachment.md`。

### 4.11 成果の振り返り

本文は `docs/requirements/achievement.md`（数える規則・卒業と節目・灯り・日記）と `docs/requirements/achievement-reflection.md`（振り返りの依頼）。

#### 数えられない・読めないとき

本文は `docs/requirements/achievement.md`。

#### 何を数えるか

本文は `docs/requirements/achievement.md`。

#### `done` になった日

本文は `docs/requirements/achievement.md`。

#### 卒業と節目

本文は `docs/requirements/achievement.md`。

#### 灯りの段階

本文は `docs/requirements/achievement.md`。

#### 日記

本文は `docs/requirements/achievement.md`。

#### 振り返りの依頼

本文は `docs/requirements/achievement-reflection.md`。

### 4.12 トークン消費の見直し

本文は `docs/requirements/token-usage-review.md`。

## 5. 実行環境・非機能要件

本文は `docs/requirements/constraint-and-environment.md`。

## 6. 既存のものとの関係（なぜ作るのか）

本文は `docs/requirements/purpose-and-scope.md`。

## 7. 未決事項

決まっていないことは、ここに未決のまま残す（決まったらこの節から本文へ移す）。
対応するタスクは Beads の課題。

| 未決事項 | 対応タスク |
| -------- | ---------- |

**決まって本文へ移したもの・前提ごと消えたものの記録**は
`docs/history/decision.md`「requirements.md 7. 未決事項」。

## 8. 参照

- 採用アーキテクチャと、採らなかった案: [`docs/architecture.md`](./architecture.md)
- 用語の定義: [`docs/glossary.md`](./glossary.md)
- コーディング規約: [`docs/coding-standards.md`](./coding-standards.md)
- 外に依存しているものの洗い出しと「外せるか」の評価: [`docs/research/external-dependency.md`](./research/external-dependency.md)
