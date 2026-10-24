# テスト

ステータス: **正典**。

責務: 対象ごとのテストの方法、E2E（走らせ方・成果物・シナリオ）、手で確かめる手順を持つ。
読む時: テストを足す・E2E を直す・目視で確かめるとき。
直す時: テストの段取り・E2E の足場・目視の手順を変えたとき。

## 節の索引

| 節                  | 中身                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| ## テスト           | 対象ごとの方法、フィクスチャの作法、**E2E（走らせ方・成果物・期待値の範囲・揺れを生まない書き方・シナリオ）**、E2E に任せないもの |
| ## 手で確かめること | 自動チェックで捉えられない見た目の確認手順                                                                                        |

本文は 11 の子のファイル（`docs/architecture/testing/`）に分けてある。節の見出しはここに残し、中身は移し先を引く。

- `docs/architecture/testing/method-and-fixture.md`: `## テスト` の本文（対象ごとの方法）、フィクスチャ、E2E に任せず単体テストに残すもの
- `docs/architecture/testing/e2e-run.md`: E2E の走らせ方
- `docs/architecture/testing/e2e-artifact-and-expectation.md`: E2E の成果物と再現、E2E の期待値の範囲
- `docs/architecture/testing/e2e-flake-free-writing.md`: E2E の揺れを生まない書き方
- `docs/architecture/testing/e2e-scenario-turn-and-input.md`: E2E のシナリオの一覧の前置きと、ターン・入力欄・吹き出し・反応・レポート・狭い画面の行
- `docs/architecture/testing/e2e-scenario-conversation-layout.md`: E2E のシナリオの一覧のうち、お伺い・進み具合の帯・バックグラウンドタスク・脇の話・会話の画面の段と局面の行
- `docs/architecture/testing/e2e-scenario-conversation-state.md`: E2E のシナリオの一覧のうち、押す的と字・始め方の一覧・失敗の塊・終わったあとの入力欄・読み上げ・見直し・結論部の行
- `docs/architecture/testing/e2e-scenario-task-chat-and-setting.md`: E2E のシナリオの一覧のうち、タスク・雑談・覚えていること・切り替え・操作子・設定・ちらつきの行と、まだ無いシナリオ
- `docs/architecture/testing/visual-check.md`: 手で確かめることの前半（目視が要る理由・状態のカタログ・撮る前の待ち・途中の画・窓の大きさで撮る）
- `docs/architecture/testing/visual-check-interaction.md`: 手で確かめることの中ほど（手を動かして出す状態・1件だけ撮る・場面ごとの撮り方）
- `docs/architecture/testing/visual-check-revision-and-scene.md`: 手で確かめることの後半（変更前と撮り比べる・目視で起こす tsukumo・場面ごとの確かめ・合成 PNG）

## テスト

本文は `docs/architecture/testing/method-and-fixture.md`。

### フィクスチャ

本文は `docs/architecture/testing/method-and-fixture.md`。

### E2E の走らせ方

本文は `docs/architecture/testing/e2e-run.md`。

### E2E の成果物と再現

本文は `docs/architecture/testing/e2e-artifact-and-expectation.md`。

### E2E の期待値の範囲

本文は `docs/architecture/testing/e2e-artifact-and-expectation.md`。

### E2E の揺れを生まない書き方

本文は `docs/architecture/testing/e2e-flake-free-writing.md`。

### E2E のシナリオの一覧

本文は `docs/architecture/testing/e2e-scenario-turn-and-input.md`（前置きと1つ目の表）と `docs/architecture/testing/e2e-scenario-conversation-layout.md`（2つ目）と `docs/architecture/testing/e2e-scenario-conversation-state.md`（3つ目）と `docs/architecture/testing/e2e-scenario-task-chat-and-setting.md`（4つ目とまだ無いシナリオ）。

### E2E に任せず単体テストに残すもの

本文は `docs/architecture/testing/method-and-fixture.md`。

## 手で確かめること

本文は `docs/architecture/testing/visual-check.md`（前半）と `docs/architecture/testing/visual-check-interaction.md`（中ほど）と `docs/architecture/testing/visual-check-revision-and-scene.md`（後半）。
