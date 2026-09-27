# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

- docs の責務を組み替え、各ファイルの責務・読む時・直す時を明確にする（2026-09-27 のユーザーの指示。案は同日の会話）
  - `docs/architecture.md` を全体構造の入口にする（層・機能と辺・置き場所の基準・プロトコルの不変条件・動きの順序・安全の境界。いまの design.md 2〜5・9章と、architecture.md「採用アーキテクチャ」「新しいコードを置く場所」を合わせる）。`architecture-proposal` スキルが「採用後の正典は `docs/architecture.md`」と名指ししているのとも合う
  - 機能・領域ごとの詳細は `docs/architecture/` に置く（chat-mode・display・screen-design と、design.md の 6章 browser・7章 キャラクターパック・10章 テスト（architecture.md「手で確かめること」を合わせる）・11章 ビルド）
  - architecture.md「設計判断（なぜ今の形なのか）」は **`docs/architecture/adr/`** に1判断1ファイルで移す（ユーザー決定。`domain-modeling` の既定 `docs/adr/` ではなく、設計に関わるものとして architecture の下に置く）
  - 「既知の制約・注意点」「現在の実装状況」の置き先は、中身を読んでから決める（前者は各機能のファイルへ分ける、後者の経緯は `docs/history/` へ、が見込み）
  - 各ファイルの冒頭に責務・読む時・直す時を書き、CLAUDE.md の索引も合わせる
  - 参照は design.md 1544・architecture.md 476 箇所あり、章の句で引かれているので段に分けて1段ずつ main へ送る（段の例: adr を作って設計判断を移す → design.md の機能別の章を移す → 残りを architecture.md に合わせて design.md を消す → chat-mode などを移す）

## エージェントのドラフト

- **`report` の `inputSchema` を縮める（`.readonly()` が出す `readOnly: true` と、8回繰り返す `fold` の説明）**（振り返り: T-705）
  - 根拠: T-705 で引数を `sections` に替えたら、実物の `tools/list` で `inputSchema` が 1198 → 5086 字、文面の縮み（−1565）と差し引きで +2323 字になり、提案書 9 章の見込み（+1〜2 千字）を超えた。委譲先の報告で、押し上げている箇所として上の2つが挙がった
  - 出し先: タスク（schema を組む側で `readOnly` を出さない・`fold` の説明を1か所に寄せ、`docs/display.md` 4.2 の測った値の表を取り直す）
- **委譲の依頼文に、新しく書くコメントの禁止事項（呼ぶ側・前例のファイル名・正典の要約と参照を並べない）を1行で渡す**（振り返り: T-706）
  - 根拠: T-706 の委譲先は新規ファイル3つの冒頭と型・関数の JSDoc に「呼ぶのは `session-manager`」「`ContextUsageLog` と同じ形」「`docs/coding-standards.md`「エラーハンドリング」」のような呼ぶ側・前例・規約の参照を並べ、受け入れでメインが7ファイルぶん刈り込んだ（`report-usage.ts` の冒頭9行 → 2行など）。CLAUDE.md の規約にある条だが、委譲先は前例の `context-usage-log.ts` の長いコメントを手本に写していた
  - 出し先: `next-task` 手順5の渡すものの並び（「コメントは CLAUDE.md のコメントの条に従い、前例のファイルのコメントの量を手本にしない」）。前例側の長いコメントは T-741〜T-743 の見直しで減る
- **`node scripts/capture-catalog.ts` が `src/shared/frame.ts:95` の初期化順（`Cannot access 'stampedEventSchema' before initialization`）で落ちるのを直す**（振り返り: T-684）
  - 根拠: T-684 の委譲先が目視の撮影で `node` から打つと落ち、`bun` で打って回避した。T-682 で scripts を Node へ移したあとも、目視の手順の口が Node では動いていない。T-684 は `frame.ts` に触れていない
  - 出し先: タスク（循環 import か宣言順を当て、`node` で `capture-catalog.ts --only notation` が撮れることを完了条件にする）
- **`bun run dev` の HMR で直したぶんが `dist/browser/` に乗らず、次の `tsukumo` の起動で「ソースのほうが新しい」と出る退行を扱う**（振り返り: T-685）
  - 根拠: T-685 で `ui-rebuild.ts` の見張り（保存のたびに `dist/browser/` へ組み立て直していた）を Vite の開発サーバに替えた。開発サーバはメモリで配るので、開発中に直したものを次の起動へ乗せるには `bun run build` を手で打つ必要が出た
  - 出し先: タスク（開発サーバを止めるときか保存が静まったときに `buildUiBundle` を起こすか、手で打つ運用のまま `docs/design.md` 11章に書くかを決める）
- **`docs/design.md` 冒頭の役割の宣言に、残した3つ（10章のテストの段取り・11章のビルドの仕組み・2章の `components/ui/` の variant の作法）が入っていない**（振り返り: T-698）
  - 根拠: T-698 の通読で見つかった。3つとも残すと決まっているか多数のコードが引くので中身は残し、宣言（2026-09-26 ユーザー承認）は書き換えなかった
  - 出し先: 判断の要るタスク（hold）。宣言を広げるか、ui の作法を `docs/coding-standards.md` へ移すかを決める
- **正典と実物のずれ2件（`src/shared/utils/` の import を見る検査が無い・`src/shared/session-state.ts` の tasks の「不明」表示が指す `docs/design.md` 4.1 に記述が無い）**（振り返り: T-698）
  - 根拠: T-698 の通読で見つかった。2章は「他の層に `utils/` を作るときも同じ検査を足す」と定めるが `src/shared/utils/optional-string.ts` に検査が無い。4.1 のずれは T-698 の前から
  - 出し先: タスク（検査を足し、コメントの指し先を正典の実在する句に張り替える）
- **`test/server/view-server/adapter/bundle.test.ts` が実物の `dist/browser/` を書き換え、並んで走る `test/cli.test.ts` の起動が成果物の対を読めずに落ちる揺れを直す**（振り返り: T-760）
  - 根拠: T-760 の委譲先が `pnpm run check` を数回回すうちに、`cli.test.ts` の1件がこの組み合わせで落ちた（単独では通る）。`bundle.test.ts` のコメントに副作用として書かれているが、それを扱うタスクは無い。Vitest に移って単体テストのファイルが並列に走るようになってから当たりやすくなっている見込み（確かめていない）
  - 出し先: タスク（`buildUiBundle` の出し先を引数で渡して一時ディレクトリに書くか、2つのファイルを直列にする。`pnpm run test` を10回回して落ちないことを完了条件にする）
