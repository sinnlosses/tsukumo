# 用語集

tsukumo で使う固有の用語を、**日本語表記・コード上で使う英語識別子・定義**の3点でまとめたもの。
表記ゆれを防ぐことが目的なので、迷ったらここに合わせる。

**方針**:

- ここに載せるのは**このプロジェクト固有の概念だけ**。タイムアウト・リトライ・エラー型のような
  一般的なプログラミング概念は載せない
- **コードに実在する英語識別子は確定**で、`英語識別子` と書く。`src/` に当たらないものだけ
  `英語識別子（予定）` と書く（まだ名前が決まっていない、または使わなくなった語）。
  変えたくなったら**先にここを直してからコードを直す**
- 同じものを指す言い方が複数あるときは1つに決め、他は「避ける言い方」に書く

責務: 日本語表記・コード上の英語識別子・定義の対応をまとめた用語集を持つ。
読む時: 用語や識別子の表記に迷ったとき。
直す時: 新しい概念に名前を付けたとき、識別子を変えたいとき（コードより先にここを直す）。

## このファイルの読み方

約104KBあるので通読しない。下の索引で用語を1つ特定して
その見出しだけを読む:

```bash
sed -n '/^### 立ち絵/,/^#\{2,4\} /p' docs/glossary/*.md
```

### 用語の索引

この表は `pnpm run format` が `docs/glossary/` の子のファイルの1行目の題から書き直すので、手で直さない。

| ファイル                                   | 中身                                         |
| ------------------------------------------ | -------------------------------------------- |
| `docs/glossary/achievement.md`             | 用語集: 成果と日記                           |
| `docs/glossary/block.md`                   | 用語集: レポートの節と塊                     |
| `docs/glossary/character.md`               | 用語集: 立ち絵とキャラクターパック           |
| `docs/glossary/communication.md`           | 用語集: 通信（移行後）                       |
| `docs/glossary/conversation-archive.md`    | 用語集: 会話のアーカイブと作業記憶           |
| `docs/glossary/conversation-phase.md`      | 用語集: 会話の画面の局面と札                 |
| `docs/glossary/conversation-tool.md`       | 用語集: 会話のツールと呼び出しの差し戻し     |
| `docs/glossary/delegation.md`              | 用語集: 委譲                                 |
| `docs/glossary/detail-and-report.md`       | 用語集: 詳細とレポート                       |
| `docs/glossary/local-record.md`            | 用語集: 手元に残す記録                       |
| `docs/glossary/memory.md`                  | 用語集: 覚えることと思い出すこと             |
| `docs/glossary/runtime-and-claude-code.md` | 用語集: 実行構成と Claude Code 側の仕組み    |
| `docs/glossary/session-and-plan.md`        | 用語集: セッション・プラン・transcript       |
| `docs/glossary/speech.md`                  | 用語集: 吹き出しとセリフ                     |
| `docs/glossary/turn.md`                    | 用語集: ターン                               |
| `docs/glossary/usage-review.md`            | 用語集: トークン消費の見直し                 |
| `docs/glossary/view.md`                    | 用語集: ビューと画面の面                     |
| `docs/glossary/work-plan.md`               | 用語集: ワークプランと段・ワークフローの設定 |

本文は 18 の子のファイル（`docs/glossary/`）に分けてある。見出しはここに残し、中身は移し先を引く。新しい用語は子のファイルにだけ足す。

## 実行構成

本文は `docs/glossary/runtime-and-claude-code.md`。

### サイドカー

本文は `docs/glossary/runtime-and-claude-code.md`。

### ペイン

本文は `docs/glossary/runtime-and-claude-code.md`。

### サイドバー

本文は `docs/glossary/runtime-and-claude-code.md`。

### ホスト

本文は `docs/glossary/runtime-and-claude-code.md`。

### Claude Code

本文は `docs/glossary/runtime-and-claude-code.md`。

### 部屋

本文は `docs/glossary/runtime-and-claude-code.md`。

### チェックアウト

本文は `docs/glossary/runtime-and-claude-code.md`。

### Beads アダプタ

本文は `docs/glossary/runtime-and-claude-code.md`。

## 会話の駆動

本文は `docs/glossary/session-and-plan.md`・`docs/glossary/turn.md`・`docs/glossary/conversation-tool.md`・`docs/glossary/work-plan.md`・`docs/glossary/delegation.md`・`docs/glossary/memory.md`・`docs/glossary/conversation-archive.md`・`docs/glossary/usage-review.md`・`docs/glossary/achievement.md`。

### セッション

本文は `docs/glossary/session-and-plan.md`。

### セッションの占有ファイル

本文は `docs/glossary/session-and-plan.md`。

### 短縮ID

本文は `docs/glossary/session-and-plan.md`。

### セッションの要約

本文は `docs/glossary/session-and-plan.md`。

### セッションドライバ

本文は `docs/glossary/session-and-plan.md`。

### プラン

本文は `docs/glossary/session-and-plan.md`。

### 利用上限

本文は `docs/glossary/session-and-plan.md`。

### プラン使用量

本文は `docs/glossary/session-and-plan.md`。

### コンテキストの内訳

本文は `docs/glossary/session-and-plan.md`。

### ターン

本文は `docs/glossary/turn.md`。

### ターンの失敗

本文は `docs/glossary/turn.md`。

### 終わったターンの数

本文は `docs/glossary/turn.md`。

### バックグラウンドタスク

本文は `docs/glossary/turn.md`。

### speak ツール

本文は `docs/glossary/conversation-tool.md`。

### report ツール

本文は `docs/glossary/conversation-tool.md`。

### work_plan ツール

本文は `docs/glossary/conversation-tool.md`。

### question_brief ツール

本文は `docs/glossary/conversation-tool.md`。

### clear_and_send ツール

本文は `docs/glossary/conversation-tool.md`。

### ワークプラン

本文は `docs/glossary/work-plan.md`。

### 段のまとめ

本文は `docs/glossary/work-plan.md`。

### まとめ待ちの段

本文は `docs/glossary/work-plan.md`。

### 並列の段

本文は `docs/glossary/work-plan.md`。

### 段の群

本文は `docs/glossary/work-plan.md`。

### 委譲の返却

本文は `docs/glossary/delegation.md`。

### phase_result ツール

本文は `docs/glossary/delegation.md`。

### 飛ばした段

本文は `docs/glossary/delegation.md`。

### 委譲先の段の範囲

本文は `docs/glossary/delegation.md`。

### 委譲ゲート

本文は `docs/glossary/delegation.md`。

### ワークフローの設定

本文は `docs/glossary/work-plan.md`。

### 並び

本文は `docs/glossary/work-plan.md`。

### 設定コマンド

本文は `docs/glossary/work-plan.md`。

### 呼び出しの差し戻し

本文は `docs/glossary/conversation-tool.md`。

### 脇の話

本文は `docs/glossary/turn.md`。

### 進みの差し込み

本文は `docs/glossary/delegation.md`。

### remember ツール

本文は `docs/glossary/memory.md`。

### forget ツール

本文は `docs/glossary/memory.md`。

### 外部由来の印

本文は `docs/glossary/memory.md`。

### recall ツール

本文は `docs/glossary/memory.md`。

### recall_episode ツール

本文は `docs/glossary/memory.md`。

### 覚えたこと

本文は `docs/glossary/memory.md`。

### あらすじ

本文は `docs/glossary/memory.md`。

### 最近の話題

本文は `docs/glossary/memory.md`。

### 会話のアーカイブ

本文は `docs/glossary/conversation-archive.md`。

### 作業記憶

本文は `docs/glossary/conversation-archive.md`。

### 定着

本文は `docs/glossary/conversation-archive.md`。

### エピソード索引

本文は `docs/glossary/conversation-archive.md`。

### 圧縮の区切り

本文は `docs/glossary/conversation-archive.md`。

### 許可プロンプト

本文は `docs/glossary/turn.md`。

### transcript

本文は `docs/glossary/session-and-plan.md`。

### プロジェクトスラッグ

本文は `docs/glossary/session-and-plan.md`。

### ターンの本文

本文は `docs/glossary/turn.md`。

### 見直し

本文は `docs/glossary/usage-review.md`。

### 見直しの段

本文は `docs/glossary/usage-review.md`。

### 提案

本文は `docs/glossary/usage-review.md`。

### usage_review_stage ツール

本文は `docs/glossary/usage-review.md`。

### usage_review_result ツール

本文は `docs/glossary/usage-review.md`。

### 見送り

本文は `docs/glossary/usage-review.md`。

### 前回の見直し

本文は `docs/glossary/usage-review.md`。

### diary ツール

本文は `docs/glossary/achievement.md`。

## 表示

本文は `docs/glossary/view.md`・`docs/glossary/character.md`・`docs/glossary/speech.md`・`docs/glossary/detail-and-report.md`・`docs/glossary/block.md`・`docs/glossary/conversation-phase.md`・`docs/glossary/local-record.md`・`docs/glossary/achievement.md`。

### ビュー

本文は `docs/glossary/view.md`。

### 画面

本文は `docs/glossary/view.md`。

### キャラクター画面

本文は `docs/glossary/view.md`。

### メインビュー

本文は `docs/glossary/view.md`。

### キャラビュー

本文は `docs/glossary/view.md`。

### ビューサーバ

本文は `docs/glossary/view.md`。

### 立ち絵

本文は `docs/glossary/character.md`。

### 顔

本文は `docs/glossary/character.md`。

### プロフィール

本文は `docs/glossary/character.md`。

### ペルソナ

本文は `docs/glossary/character.md`。

### 立ち絵からの生成

本文は `docs/glossary/character.md`。

### 自己紹介文

本文は `docs/glossary/character.md`。

### 利用者の呼び名

本文は `docs/glossary/character.md`。

### ミニ立ち絵の呼び名

本文は `docs/glossary/character.md`。

### 吹き出し

本文は `docs/glossary/speech.md`。

### 反応

本文は `docs/glossary/speech.md`。

### セリフのログ

本文は `docs/glossary/speech.md`。

### セリフ

本文は `docs/glossary/speech.md`。

### 詳細

本文は `docs/glossary/detail-and-report.md`。

### 最終レポート

本文は `docs/glossary/detail-and-report.md`。

### 目録の1行

本文は `docs/glossary/detail-and-report.md`。

### 報告の種類

本文は `docs/glossary/detail-and-report.md`。

### 変更の札

本文は `docs/glossary/detail-and-report.md`。

### 中間レポート

本文は `docs/glossary/detail-and-report.md`。

### 経過の畳み

本文は `docs/glossary/detail-and-report.md`。

### お願い

本文は `docs/glossary/detail-and-report.md`。

### 検証結果

本文は `docs/glossary/detail-and-report.md`。

### 合図の行

本文は `docs/glossary/detail-and-report.md`。

### 節

本文は `docs/glossary/block.md`。

### 塊

本文は `docs/glossary/block.md`。

### 形の札

本文は `docs/glossary/block.md`。

### 確度つきの主張

本文は `docs/glossary/block.md`。

### 余白の柱

本文は `docs/glossary/block.md`。

### やり取りの列

本文は `docs/glossary/block.md`。

### 選択肢の比較

本文は `docs/glossary/block.md`。

### 表情

本文は `docs/glossary/character.md`。

### 書く動き

本文は `docs/glossary/character.md`。

### 背景のオーバーレイ

本文は `docs/glossary/view.md`。

### いまの作業

本文は `docs/glossary/conversation-phase.md`。

### 依頼の手順

本文は `docs/glossary/conversation-phase.md`。

### 局面

本文は `docs/glossary/conversation-phase.md`。

### 失敗の塊

本文は `docs/glossary/conversation-phase.md`。

### 進み具合の帯

本文は `docs/glossary/conversation-phase.md`。

### お伺い

本文は `docs/glossary/conversation-phase.md`。

### 画面の頭

本文は `docs/glossary/view.md`。

### 引き出し

本文は `docs/glossary/view.md`。

### 答え待ちの札

本文は `docs/glossary/conversation-phase.md`。

### ボトムシート

本文は `docs/glossary/view.md`。

### 設定の点

本文は `docs/glossary/view.md`。

### 添え書き

本文は `docs/glossary/conversation-phase.md`。

### 始め方の一覧

本文は `docs/glossary/conversation-phase.md`。

### おすすめの札

本文は `docs/glossary/conversation-phase.md`。

### 迎えの挨拶

本文は `docs/glossary/speech.md`。

### 待ちの一言

本文は `docs/glossary/speech.md`。

### 依頼の全文

本文は `docs/glossary/conversation-phase.md`。

### 知らせの行

本文は `docs/glossary/conversation-phase.md`。

### 進行の計測値

本文は `docs/glossary/local-record.md`。

### 診断ログ

本文は `docs/glossary/local-record.md`。

### 成果

本文は `docs/glossary/achievement.md`。

### 成果の日記書き

本文は `docs/glossary/achievement.md`。

### 日記

本文は `docs/glossary/achievement.md`。

### 日記帳

本文は `docs/glossary/achievement.md`。

### しおり

本文は `docs/glossary/achievement.md`。

### 灯りの暦

本文は `docs/glossary/achievement.md`。

### 卒業

本文は `docs/glossary/achievement.md`。

### 節目

本文は `docs/glossary/achievement.md`。

### キャラクターパック

本文は `docs/glossary/character.md`。

### フォールバック

本文は `docs/glossary/character.md`。

## Claude Code 側の仕組み

本文は `docs/glossary/runtime-and-claude-code.md`。

### hook

本文は `docs/glossary/runtime-and-claude-code.md`。

### statusline

本文は `docs/glossary/runtime-and-claude-code.md`。

### output style

本文は `docs/glossary/runtime-and-claude-code.md`。

## 通信（移行後）

本文は `docs/glossary/communication.md`。

### 共有層

本文は `docs/glossary/communication.md`。

### アダプタ

本文は `docs/glossary/communication.md`。

### フレーム

本文は `docs/glossary/communication.md`。

### コマンド

本文は `docs/glossary/communication.md`。

### 契約

本文は `docs/glossary/communication.md`。

### 手続き

本文は `docs/glossary/communication.md`。

### セッションの状態

本文は `docs/glossary/communication.md`。

### fake driver

本文は `docs/glossary/communication.md`。

### 疑似セッション

本文は `docs/glossary/communication.md`。
