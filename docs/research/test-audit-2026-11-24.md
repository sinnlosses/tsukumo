# 11-05 以降に増えたテストの監査（2026-11-24）

ステータス: 一次情報（数えた記録と刈る候補）。刈る作業は領域ごとのドラフトで行い、この文書は規約を変えない。

問い: `b38e3a59f`（11-05 前）から今までに増えたテストに、`test-audit` スキルの「ゴミの型」に当たるもの（価値の低いテスト・実装に結合したテスト・重複・テスト専用の本番の継ぎ目）はどこに、どれだけあるか。

## 数え方

- 対象は `git diff -M --name-status b38e3a59f HEAD -- test` で追加（`A`）のファイルと、`git diff -M --numstat b38e3a59f HEAD -- test` の増えた行から減った行を引いた値が 100 以上の変更（`M`）・移動（`R`）のファイル。削除（`D`）は数えない。
- 差分の全体は `A` 319・`M` 478・`R` 132・`D` 45。
- 外したもの: 上限超えの 5 本（`character-edit.test.ts`・`character-pack.test.ts`・`persona-memory.test.ts`・`shell-write-rule.test.ts`・`screen-nav.test.tsx`）と、それらを割ったコミット `c61405b61` が足した 9 本（`screen-nav-mode.test.tsx`・`screen-nav-harness.tsx`・`character-edit-harness.ts`・`persona-memory-harness.ts`・`shell-write-rule-script-file.test.ts`・`character-edit-create.test.ts`・`character-edit-image.test.ts`・`character-pack-asset.test.ts`・`persona-memory-notify.test.ts`）。5 本は割ったあとの純増が 100 行に届かず、もともと上の条件に当たらない。
- 行数は HEAD のファイルの行数（改行の数）。
- 対象は 332 本・38,701 行（`A` 310・`M` 19・`R` 3）。うち `*.test.ts`・`*.test.tsx` は 270 本・33,011 行で、残りはフィクスチャ・ハーネス・E2E の期待値の JSON・ハーネスの再試の記録。

## 領域ごとの件数と行数

| 領域                                    | 件数 | 行数   | うちテストのファイル |
| --------------------------------------- | ---- | ------ | -------------------- |
| server                                  | 35   | 4,642  | 34                   |
| shared                                  | 25   | 2,402  | 25                   |
| browser: 会話画面                       | 69   | 9,984  | 69                   |
| browser: レポート                       | 41   | 5,732  | 41                   |
| browser: 地図と今の作業                 | 10   | 1,371  | 10                   |
| browser: タスク一覧                     | 10   | 1,555  | 8                    |
| browser: 枠と設定                       | 17   | 1,745  | 17                   |
| browser: ui 部品                        | 15   | 822    | 15                   |
| browser: 共通（domain・stores・utils）  | 16   | 1,682  | 16                   |
| scripts                                 | 7    | 457    | 7                    |
| architecture                            | 15   | 1,840  | 12                   |
| e2e                                     | 15   | 4,379  | 11                   |
| 支援（fixture・wiring・再試の記録ほか） | 57   | 2,090  | 5                    |
| 計                                      | 332  | 38,701 | 270                  |

browser の内訳は、会話画面が `test/browser/components/page/conversation/`、レポート・地図と今の作業・タスク一覧が `test/browser/features/` の `report`・`architecture-map` と `current-work`・`task-board`、枠と設定が `test/browser/components/frame/` と `app/`、ui 部品が `test/browser/components/ui/`、共通が `test/browser/domain/`・`stores/`・`utils/`。支援は `test/fixture/`（11 本・300 行）・`test/harness-replay/`（40 本・1,446 行）・`test/wiring/`（4 本・244 行）・`test/document/`（1 本・69 行）・`test/popover-setup.ts`（1 本・31 行）。

増えた量のうち、会話画面の進行（手順の図・ステータスピル・帯）・レポートの部品・地図・タスク一覧は 11-05 以降に足した機能のテストで、件数の多さそのものは問題にしない。

## 監査の手順

- 対象の 270 本のテストの題（`it`・`test` の第1引数）を全部抜き出し、同じ題が2つ以上のファイルにあるものを洗った。当たりは3組（`変換中の Enter では開かない`・`メタ文字のない文字列はそのまま`・`コメントの中の宣言は数えない`）で、どれも別の実装（別のキーの処理・別の関数・別の正規表現）を守っており重複ではない。
- 同じ契約を層ごとに持ちやすい組（純粋な関数の `domain`・store・hook・部品の3〜4層）を選び、題と本文を読んで、同じ入力で同じ観察を検査している件を探した。読んだ組は、離れていたあいだの線・セリフの届き・お願いの見え方・フェーズの詳細・祝う動きと祝光・漫符・答えの投稿・留めたセリフ（会話画面）、対の見せ方・図の項目名・用語の注（レポート）、探す欄・一覧・並べ替え（タスク一覧）、動きと見た目の設定（枠と設定）、今の場面の材料・地図とレポートの対応（server）、デザイントークンの宣言の数え方（architecture）、E2E と同じ流れの単体（e2e）。
- 「刈る」「畳む」は、同じ観察を、同じかより強い境界（部品の描画）で検査している残りのテストを名指せるものだけにした。名指せないもの・層に固有の危険（store の時刻・hook の描き直しの回数・E2E の実ブラウザ）があるものは「残す」に倒した。
- 呼ばれていない継ぎ目（テストだけが使う export）は、刈る候補の行で消せる本番コードが無いことを確かめた（どの候補もテストの中の件を減らすだけで、本番コードは変わらない）。

## 候補

### 会話画面

| ファイル                                                                                                   | 判定 | 理由                                                                                                                                                                                    | その契約を守る残りのテスト                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/browser/components/page/conversation/components/character-view/hooks/use-character-view.test.tsx`    | 刈る | `describe("祝う")` の3件（finished のタスクで祝い task の無い report で跳ねる・窓より前の復元で動かない・動きを減らす設定で跳ねる）は、純粋な関数と部品の描画が同じ入力で同じ観察を持つ | `test/browser/components/page/conversation/components/character-view/character-view-celebrate.test.tsx`・`test/browser/domain/portrait-motion-celebrate.test.ts` |
| `test/browser/components/page/conversation/components/character-view/character-view-celebrate.test.tsx`    | 畳む | 「祝光は光の星5つと花びら20枚…動きを減らす設定では出ない」の後半（動きを減らす設定で出ない）は、同じファイルの「動きを減らす設定では光が無い」と同じ観察。題と本文を前半だけにする      | 同じファイルの「動きを減らす設定では光が無い」                                                                                                                   |
| `test/browser/components/page/conversation/stores/speech-arrival.test.ts`                                  | 畳む | 「声のある姿を入れた直後は無い」「声の多い姿へ丸ごと入れ替えると無い」は、部品の描画で同じ入れ方（`putState`）をして付かないことを見ている。時刻を見る「声が1件増えると、届いた」は残す | `test/browser/components/page/conversation/components/main-view/turn-speech-arrival.test.tsx`（「声のある姿を丸ごと入れて描いただけでは付かない」）              |
| `test/browser/components/page/conversation/components/main-view/turn-away-seam.test.tsx`                   | 畳む | 「新しい行が無ければ出ない」は線を置く位置の決め方そのもので、純粋な関数の「新しい行が無ければ出さない」と同じ入力の境目。部品の側は出る・別のやり取り・外す、の3件で配線を守れる       | `test/browser/components/page/conversation/components/main-view/domain/away-seam.test.ts`（「新しい行が無ければ出さない」）                                      |
| `test/browser/components/page/conversation/components/main-view/hooks/use-work-strip-phase-detail.test.ts` | 畳む | 「やり取りが替わると閉じて見え、手順の一覧を開くと閉じる」の後半（一覧を開くと詳細が閉じる）は、部品で押して同じことを見ている。前半（やり取りが替わる）は部品のテストに無いので残す    | `test/browser/components/page/conversation/components/main-view/work-strip-phase-detail.test.tsx`（「詳細と手順の一覧は同時に1つだけ開き…」）                    |
| `test/browser/components/page/conversation/stores/favor-visibility.test.ts`                                | 残す | hook のテストは store へ写す配線だけを見ており、送ったあとに同じお願いで出さない判定は store にしか無い                                                                                 | —                                                                                                                                                                |
| `test/browser/components/page/conversation/components/character-view/character-view-manpu.test.tsx`        | 残す | 純粋な関数（`portrait-motion-ending-manpu.test.ts`）と条件が重なるが、部品の側は控えめの印・重ねの数・床の立ち絵に出ないことという描画に固有の観察を持つ                                | —                                                                                                                                                                |
| `test/browser/components/page/conversation/components/main-view/answer-post.test.tsx`                      | 残す | 字の組み立ては `domain/question-answer-post.test.ts`、押したときの下書きと出る場所はこのファイルと `turn-answer-post.test.tsx` に分かれ、同じ観察が無い                                 | —                                                                                                                                                                |
| `test/browser/components/page/conversation/components/main-view/turn-speech-pin.test.tsx`                  | 残す | E2E の `speech-pin.test.ts` は実ブラウザの流れを1本持つ方針（利用者に見える流れを1本ずつ）で、単体は反応の行・過去のやり取り・Esc の分岐を持つ                                          | —                                                                                                                                                                |

### レポート

| ファイル                                                        | 判定 | 理由                                                                                                                                                        | その契約を守る残りのテスト |
| --------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `test/browser/features/report/a2ui-surface-pair-view.test.tsx`  | 残す | 対の探し方と見出しの語は `domain/pair-view.test.ts`、紙の上の切り替えが1つだけ出ることはこのファイル、葉の群は `compare-leaf-pair-view.test.tsx` に分かれる | —                          |
| `test/browser/features/report/a2ui-surface-chart-term.test.tsx` | 残す | 語の引き当ては `domain/chart-term-link.test.ts`、印の包み方は `rehype-chart-term.test.tsx`、重ねたときの札の出入りはこのファイルにしか無い                  | —                          |
| `test/browser/features/report/a2ui-surface-term-note.test.tsx`  | 残す | 1つの段落の中の最初の1か所は `rehype-term-note.test.tsx`、紙全体で最初の節だけが受け取ることはこのファイルにしか無い                                        | —                          |

### タスク一覧

| ファイル                                                      | 判定 | 理由                                                                                                                                                     | その契約を守る残りのテスト |
| ------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `test/browser/features/task-board/task-search-field.test.tsx` | 残す | 「変換中の Enter では開かない」は `task-board-order.test.tsx` と同じ題だが、別の hook（`use-task-list-model.ts` と `use-task-board.ts`）の別の分岐を守る | —                          |
| `test/browser/features/task-board/task-list.test.tsx`         | 残す | 語での絞り込みは `domain/task-search.test.ts` と探す欄のテストが持ち、このファイルは語の無い一覧の段・行・サイドシートだけを見ている                     | —                          |

### 枠と設定

| ファイル                                                                 | 判定 | 理由                                                                                                                     | その契約を守る残りのテスト |
| ------------------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| `test/browser/components/frame/screen-nav/settings-motion.test.tsx`      | 残す | E2E の `motion-preference.test.ts` は無限の動きが実際に止まることを実ブラウザで見る。単体は覚えさせる・既定に戻すを持つ  | —                          |
| `test/browser/components/frame/screen-nav/settings-look-adjust.test.tsx` | 残す | 値からトークンを作る計算は `appearance-adjust.test.ts`、続けて動かしたときに前の値を消さないことはこのファイルにしか無い | —                          |

### server

| ファイル                                                         | 判定 | 理由                                                                                                                                                  | その契約を守る残りのテスト |
| ---------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `test/server/session-driver/core/present-scene-delivery.test.ts` | 残す | 材料ごとの計算は `present-scene.test.ts`、渡すかどうかの覚えはこのファイル、時刻の記録は `present-scene-keeper.test.ts` と層ごとに観察が違う          | —                          |
| `test/server/architecture-map/core/report-map.test.ts`           | 残す | 変えたファイルを箱に当てる規則を守る。`shared/report/report-map.test.ts` は数え方、`session/core/event/report-map.test.ts` は流すかどうかで重ならない | —                          |

### architecture

| ファイル                                              | 判定 | 理由                                                                                                                                                                                                     | その契約を守る残りのテスト |
| ----------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `test/architecture/design-token-margin.test.ts`       | 残す | 「コメントの中の宣言は数えない」は `report-visual-declaration.test.ts` と同じ題だが、`marginDeclarationCount` と `visualDeclarationCount` はそれぞれ自分でコメントを外しており、共有の手を再演していない | —                          |
| `test/architecture/report-visual-declaration.test.ts` | 残す | 同上。上限の表は減らす向きにだけ動く独立した契約で、ソースの検査が最も安い守り                                                                                                                           | —                          |

## 刈る候補の無い領域

- shared・scripts・ui 部品・共通（domain・stores・utils）・地図と今の作業・e2e・支援は、題の重複の洗い出しで当たりが無く、層の組を読んだ範囲でも同じ観察の重なりが見つからなかった。ui 部品の小さいテスト（`kbd`・`status-dot`・`visually-hidden` など）は包みが Astryx へ渡す契約（読み上げの名前・要素の種類）を1件ずつ守るもので、`test-audit` の残す基準に当たる。
- 刈る・畳む候補は会話画面の 5 本だけで、どれもテストの中の件を減らすもので本番コードは変わらない。11-05 以降の伸びの大半は新しい機能のテストで、層ごとに観察を分けて書かれている。
