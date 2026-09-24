# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

## エージェントのドラフト

### 待ち時間の訪問（T-515 の提案 `docs/research/character-visit.md` から。承認待ち）

1. **（先にユーザーに確かめる）要件の読みを決める。** (a) 訪問の台本を別の使い捨ての `query()`（`persistSession: false`・ツールなし）に作らせ、渡すのは人格・待ちの種類・時刻・今日の成果だけ、という形が `docs/requirements.md` 2.2 の「会話の外部送信」「複数セッション」に当たらないという読みでよいか。(b) 訪問のあいだだけあるじの表情を台本の表情に合わせる、という 4.3「表情の源は `speak` の1つだけ」への例外を足してよいか。承認されたら 2.2 と 4.3 に追記し、提案の決まった部分を `docs/design.md` / `docs/screen-design.md` へ移す（difficulty: opus。依存なし）
2. **パックに `visit` の節を足す。** `character.json` に任意の `visit`（`peek` の絵・`farewell` のセリフ・作り損ねたときの `scripts`）を読めるようにし（`src/shared/character-definition.ts`）、画像の上限 `MAX_IMAGE_FILES_PER_PACK` を表情の数 + 3 に広げる。帳ちゃんのパック（T-516）に `visit` と「ひょこっ」の絵を足し、つくもとの間柄を両方の人格に書く（difficulty: sonnet。依存: 1、T-516）
3. **訪問の契機を決める core の純関数と、訪問の状態を足す。** `src/server/core/visit-timing.ts`（案）: 背景のタスクだけが動いている／トップレベルのツールが走りっぱなし、が 90 秒続いたら来る・1回の待ちに1度・前の訪問から 30 分は来ない・答え待ちと雑談モードでは来ない。`SessionEvent` に `visit-started` / `visit-ended`、`SessionState` に `visit`（判別可能な合併型）。帰る合図（依頼の送信・答え待ち・本物の `speak`・セッションの終わりと切り替え）で `visit-ended`。台本はまだ 2c（パックの `scripts`）だけで動かす（difficulty: opus。依存: 1、2）
4. **台本を作る使い捨ての `query()` を足す。** `src/server/adapter/sdk-visit-script.ts`（案）: 軽いモデル・`tools: []`・`maxTurns: 1`・`persistSession: false`・`outputFormat` の JSON Schema で「話し手・表情・セリフ」の並びを受け、境界で検証する。渡すのは2つの人格・待ちの種類（`description` は渡さない）・経過時間・時間帯・今日の成果（`achievement.ts`）だけ。帰る合図で中断し、失敗・時間切れ・形の崩れは `scripts` へ落とす。指示文は core の定数（difficulty: opus。依存: 3）
5. **キャラビューに客を出す。** あるじの吹き出しの右に客の立ち絵（`peek` から入って `peek` へ戻る）と客の `accent` の吹き出し。掛け合いは2秒の間で交互に出し、あるじの吹き出しと表情は訪問のあいだだけ台本に従い、帰ったら最後の `speak` に戻す。訪問のセリフはメインビュー・ログ・記録に残さない。760px 以下では出さない。疑似セッションに場面を足して目視する（difficulty: sonnet。依存: 3）
6. **設定の歯車に「訪問」のオン・オフを置く。** 覚えた既定と同じ置き方で、オフなら契機の判断が来ないを返す（difficulty: sonnet。依存: 3）
