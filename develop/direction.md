# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

## エージェントのドラフト

### 待ち時間の訪問（T-515 の提案 `docs/research/character-visit.md` から。2026-09-25 のユーザー判断を反映済み。承認待ち）

1. **要件に決まったことを書き足す。** 2026-09-25 のユーザー判断を正典へ移す: `docs/requirements.md` 2.2 に「同じ claude への使い捨ての `query()` に仕事の会話を渡すのは外部送信に当たらない」「claude の子プロセスが一時的に2つになるのは複数セッションに当たらない」を、4.3 に「訪問のあいだだけ台本の表情を出す」例外と、提案書「表情の源」の節の3つの条件（`speechExpression`・`records` に書かない／過去のターンを見ているあいだは上書きしない／本物の `speak` と待ちの終わりで必ず帰る）を足す。4.3 の例外を入れる前に、ユーザーが提案書の「例外を設けたときの不都合」を読んで承認していること（difficulty: opus。依存なし）
2. **パックに `visit` の節を足す。** `character.json` に任意の `visit`（`peek` の絵・`farewell` のセリフ・作り損ねたときの `scripts`）を読めるようにし（`src/shared/character-definition.ts`）、画像の上限 `MAX_IMAGE_FILES_PER_PACK` を表情の数 + 3 に広げる。帳ちゃんのパック（T-516）に `visit` と「ひょこっ」の絵を足し、つくもとの間柄を両方の人格に書く（difficulty: sonnet。依存: 1、T-516）
3. **訪問の契機を決める core の純関数と、訪問の状態を足す。** `src/server/core/visit-timing.ts`（案）: 背景のタスクだけが動いている／トップレベルのツールが走りっぱなし、が 90 秒続いたら来る・1回の待ちに1度・前の訪問から 30 分は来ない・答え待ちと雑談モードでは来ない。`SessionEvent` に `visit-started` / `visit-ended`、`SessionState` に `visit`（判別可能な合併型。台本の表情はここに持ち、`speechExpression` と `records` には書かない）。帰る合図（依頼の送信・答え待ち・本物の `speak`・待ちの終わり（`tool-finished` / `turn-resumed`）・セッションの終わりと切り替え）はサーバで1つの `visit-ended` にまとめる。台本はまだ 2c（パックの `scripts`）だけで動かす（difficulty: opus。依存: 1、2）
4. **台本を作る使い捨ての `query()` を足す。** `src/server/adapter/sdk-visit-script.ts`（案）: 軽いモデル・`tools: []`・`maxTurns: 1`・`persistSession: false`・`outputFormat` の JSON Schema で「話し手・表情・セリフ」の並びを受け、境界で検証する。渡すのは2つの人格・いまの仕事の抜き書き（このターンの依頼・直近のセリフ・待っている相手の説明）・経過時間・時間帯・今日の成果（`achievement.ts`）。帰る合図で中断し、失敗・時間切れ・形の崩れは `scripts` へ落とす。指示文は core の定数（difficulty: opus。依存: 3）
5. **客の出し方をデザインし直してから、キャラビューに出す。** 2026-09-25 にユーザーが「出す場所はデザインし直す」と決めた。提案書の論点3（あるじの吹き出しの右）は叩き台で、先に `docs/screen-design.md` に出し方の節を起こしてユーザーの承認を得る（`frontend-design` スキル）。そのうえで、あるじの表情は訪問中かつ今のターンを見ているときだけ台本の行の表情にし、訪問のセリフはメインビュー・ログ・記録に残さない。疑似セッションに場面を足して目視する（difficulty: opus。依存: 3）
6. **設定の歯車に「訪問」のオン・オフを置く。** 覚えた既定と同じ置き方で、オフなら契機の判断が来ないを返す（difficulty: sonnet。依存: 3）
