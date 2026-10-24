# tsukumo 要件定義

ステータス: **正典**（未決事項は「7. 未決事項」）。**4.2「表示」は `docs/architecture/display.md` へ、
4.9「雑談モード」は `docs/architecture/chat-mode.md` へ移した**（2026-09-23。節の番号はそのまま）。この
ファイルの中でファイル名を添えずに `4.2` や `4.9` のように書いた番号は、それぞれそちらの節を
指す。

責務: やること・やらないこと・技術制約・未決事項を定める要件定義。4.2「表示」と4.9「雑談モード」は
`docs/architecture/` 側へ移し、この文書は要件の骨格だけを持つ。
読む時: 要件・やらないこと・技術制約・未決事項を知りたいとき。
直す時: 要件を追加・変更したとき、未決事項を解決したとき。

## このドキュメントの読み方

### このファイルは通読しない

節の本文は子のファイル（`docs/requirements/`）にある。下の索引で節を1つ特定し、**その節の子のファイルだけ**を開いて読む。
このファイルに本文があるのは「正典に残すもの・`docs/history/` へ移すもの」「4. 機能要件」の欠番の注記「7. 未決事項」「8. 参照」だけ。

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

## 節の索引

この表は `pnpm run format` が子のファイルの題と見出しから書き直すので、手で直さない。

| ファイル                                          | 題                                       | 節                                                                                                                                                                                                                |
| ------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/requirements/achievement-reflection.md`     | tsukumo 要件定義: 振り返りの依頼         | 4. 機能要件 / 4.11 成果の振り返り / 振り返りの依頼                                                                                                                                                                |
| `docs/requirements/achievement.md`                | tsukumo 要件定義: 成果の振り返り         | 4. 機能要件 / 4.11 成果の振り返り / 数えられない・読めないとき / 何を数えるか / `done` になった日 / 卒業と節目 / 灯りの段階 / 日記                                                                                |
| `docs/requirements/character-pack.md`             | tsukumo 要件定義: キャラクターパック     | 4. 機能要件 / 4.4 キャラクターパック                                                                                                                                                                              |
| `docs/requirements/claude-code-driving.md`        | tsukumo 要件定義: Claude Code の駆動     | 4. 機能要件 / 4.1 Claude Code の駆動                                                                                                                                                                              |
| `docs/requirements/constraint-and-environment.md` | tsukumo 要件定義: 技術制約と実行環境     | 3. 技術制約 / 5. 実行環境・非機能要件                                                                                                                                                                             |
| `docs/requirements/expression.md`                 | tsukumo 要件定義: 表情                   | 4. 機能要件 / 4.3 状態連動                                                                                                                                                                                        |
| `docs/requirements/image-attachment.md`           | tsukumo 要件定義: 画像の添付             | 4. 機能要件 / 4.10 画像の添付                                                                                                                                                                                     |
| `docs/requirements/launch-and-setting.md`         | tsukumo 要件定義: 起動と設定             | 4. 機能要件 / 4.6 起動と設定                                                                                                                                                                                      |
| `docs/requirements/portrait-motion.md`            | tsukumo 要件定義: 立ち絵の動き           | 4. 機能要件 / 4.3 状態連動                                                                                                                                                                                        |
| `docs/requirements/purpose-and-scope.md`          | tsukumo 要件定義: 目的とスコープ         | 1. 概要・目的 / 合格シーン（v1） / 「ターミナル環境」とは何を指すか / 実現の手段 / 2. スコープ / 2.1 対象とすること / 2.2 対象外とすること（スコープ外） / 2.3 想定利用者 / 6. 既存のものとの関係（なぜ作るのか） |
| `docs/requirements/screen-layout.md`              | tsukumo 要件定義: 画面レイアウト         | 4. 機能要件 / 4.7 画面レイアウト                                                                                                                                                                                  |
| `docs/requirements/session-restore-condition.md`  | tsukumo 要件定義: セッションの復元の条件 | 4. 機能要件 / 4.8 セッションの復元 / 別の窓で使用中のセッション / いつ復元するか / 復元できなかったときどうするか                                                                                                 |
| `docs/requirements/session-restore.md`            | tsukumo 要件定義: セッションの復元       | 4. 機能要件 / 4.8 セッションの復元 / 何を戻し、何を戻さないか / tsukumo 側に会話を保存しない / 鍵（切り替え先の一覧に何を出すか）                                                                                 |
| `docs/requirements/token-usage-review.md`         | tsukumo 要件定義: トークン消費の見直し   | 4. 機能要件 / 4.12 トークン消費の見直し                                                                                                                                                                           |

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
