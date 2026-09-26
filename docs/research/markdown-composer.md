# 入力欄をマークダウンエディタに切り替える設計（2026-09-27）

**この文書は調査メモであって正典ではない。** `docs/` の他ファイルにある「節の索引」はここには
作らない。入力欄を、素の `<textarea>` と「書きながら装飾が見える」マークダウンエディタの間で
切り替えられるようにする設計の提案。切り替えの仕様そのものは `docs/display.md` 4.2「入力欄」が
正典で、ここは部品の選定と、いまのコードへのつなぎ方を持つ。**依存の追加と実装はこの文書の外**。

2026-09-26 にユーザーが決めたこと（蒸し返さない）:

- 形は**書きながら装飾が見える**もの（記号は残り、見出し・太字などがその場で装飾される）。
  2枚並べのプレビューでも WYSIWYG でもない
- **素の `<textarea>` にいつでも戻せる**。下書きは1つで、切り替えても失われない
- `/` と `@` の補完、画像の添付はエディタのモードでもそのまま使える
- Enter は改行、送信は Command+Enter。エディタのモードでも同じ

## 結論

**CodeMirror 6 を、Markdown の構文木で色と字の太さ・大きさを付けるだけの最小構成で入れる。**
下書き（`Draft`）の持ち主は今までどおり `hooks/use-composer.ts` の1つで、`<textarea>` と
エディタはどちらも「下書きを映す面」に下がる。`HTMLTextAreaElement` への依存は、フォーカスと
キャレットだけを持つ小さな面の型（下の「下書きの持ち主」）で切る。IME と「書きながら装飾が見える」
形は両立する（Chrome の合成入力で確かめた。下の「IME」）ので、実装に進んでよい。

| 論点                       | 結論（1行）                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| エディタの部品             | CodeMirror 6（`@codemirror/lang-markdown` の `markdownLanguage` だけを使い、`markdown()` は呼ばない）。Milkdown と自作は採らない |
| 下書きの持ち主             | `use-composer.ts` の `draft: { text, caret }` のまま。2つの面は下書きを映すだけで、切り替えは面を差し替えるだけ                  |
| `HTMLTextAreaElement` 依存 | `textAreaRef` を「フォーカス・キャレットの読み書き」だけの面の型の ref に替え、キーと変更の型から DOM の型を外す                 |
| 補完の候補窓               | 位置は今のまま（入力欄の包みの下端に底を合わせる）。キャレットの座標は要らない                                                   |
| 補完のキー                 | エディタに最優先の `keydown` を1つ張り、`use-composer.ts` の `onKeyDown` へ渡す。処理したらエディタの keymap へ流さない          |
| 画像                       | エディタの `paste` / `dragover` / `drop` を同じ `onPaste` / `onDragOver` / `onDrop` へ渡す。画像を取ったらエディタへ流さない     |
| 切り替えの口               | 道具の行のボタン1つ（押した状態を `aria-pressed` で示す）。キーは付けない                                                        |
| 覚えるか                   | 覚える。利用者の端末の設定として `localStorage`（`browser/domain/` に1ファイル）。既定は `<textarea>`                            |
| 他の状態との併存           | 質問の間の自由入力・送信後の空・ターン進行中は、下書きと `ComposerModel` の側で決まるので2つの面で同じに効く                     |

## いまのコードの前提（2026-09-27 実測）

- 入力欄は `src/browser/components/page/conversation/components/dispatch/components/composer/`
  の4ファイル。`presentational-composer.tsx` が `<textarea>`・候補一覧・道具の行を置き、
  `hooks/use-composer.ts` が下書き（`Draft = { text, caret }`）・質問の帯・送信とキーの読み替えを、
  `hooks/use-suggestion.ts` が `/` と `@` の補完を、`hooks/use-prompt-image.ts` が画像を持つ
- `use-composer.ts` が DOM に触るのは `textAreaRef` 経由の4箇所だけ: 確定・送信・画像のあとの
  `focus()`、`useEffect` の中の `selectionStart` の読みと `setSelectionRange`、`/`・`@` の
  ボタンで `selectionStart` を読むところ。型は `ComposerKey`（`KeyboardEvent<HTMLTextAreaElement>`
  から見るものだけ）と `ComposerChange`（`HTMLTextAreaElement` の `value` と `selectionStart`）
- `use-suggestion.ts` は DOM を読まない。受け取った `Draft` から候補を畳み、確定した `Draft` を
  返すだけ（`ComposerKey` の型だけを `use-composer.ts` から借りている）
- `use-prompt-image.ts` のイベントの型は `Pick<ClipboardEvent, "clipboardData" | "preventDefault">`
  などで、`<textarea>` に縛られていない
- 補完の候補一覧（`.dispatch-suggestions`）は、`<textarea>` の包み（`.dispatch-text-wrap`）の
  下端に底を合わせた絶対配置で、キャレットの位置には追従しない
- 入力欄の単体テストは `test/browser/components/page/conversation/components/dispatch/dispatch.test.tsx`
  の1件（入力欄と答え待ちの箱を両方描く）だけ。E2E は `test/e2e/input-dispatch.test.ts` が
  `locator("textarea")` に書いて `Meta+Enter` で送る1本で、`test/e2e/expected/` の DOM の
  写し17件が `textarea` を含む（`scenario-run.ts` は `textarea` の子を辿らない）
- 依存に編集中の装飾の部品は無い。Markdown の描画はレポートの `react-markdown` 系だけ
- いまの `dist/browser/main.js` は 3,102,758 バイト（gzip 604,067）。`bun build` は minify しない

## エディタの部品

### 比べたもの

束の大きさは `/tmp` の使い捨ての場所に候補だけを入れ、tsukumo と同じ
`bun build --target=browser`（minify なし）と、参考に `--minify` で組んだ数（2026-09-27、
`bun` 1.4.2）。**tsukumo のリポジトリには入れていない。**

| 候補                                                           | 素（minify なし） | minify  | minify + gzip | 記号が残るか                                    |
| -------------------------------------------------------------- | ----------------- | ------- | ------------- | ----------------------------------------------- |
| CodeMirror 6・`markdownLanguage` だけ                          | 578,065           | 312,533 | 100,576       | 残る（構文木に色と字形を付けるだけ）            |
| CodeMirror 6・`markdown()`（コードフェンスの言語と HTML 込み） | 846,502           | 506,562 | 173,205       | 残る                                            |
| Milkdown（`@milkdown/kit` の core・commonmark・gfm・履歴）     | 963,448           | 491,546 | 146,692       | 残らない（ProseMirror の WYSIWYG で記号を消す） |
| 自作（`<textarea>` の後ろに色を付けた写しを重ねる）            | 0                 | 0       | 0             | 残る                                            |

版は `@codemirror/view` 6.43.13・`@codemirror/state` 6.7.6・`@codemirror/language` 6.12.4・
`@codemirror/commands` 6.11.1・`@codemirror/lang-markdown` 6.5.2・`@lezer/markdown` 1.7.2・
`@milkdown/kit` 7.22.2。参考に bundlephobia は `@codemirror/view` 単体を minify 249,348 / gzip
79,345 と出した（依存込み）。

### CodeMirror 6 を採る理由

- **決めた形そのものが作れる。** Markdown の構文木（`@lezer/markdown`）の節に `HighlightStyle` で
  字の大きさ・太さ・色を付けるだけで、記号（`#`・`**`）は文字として残る。記号そのものは
  `tags.processingInstruction` に当たるので、字の色を一段落とせる。Obsidian のライブプレビューも
  CodeMirror 6 の上にある（あちらは記号を隠すが、こちらは隠さないぶん簡単）
- **束の増え方が一番小さい。** `markdown()` を呼ぶとコードフェンスの言語と HTML・CSS・JS の
  文法（`@codemirror/lang-html` ほか）が静的に入り、+268KB になる。`markdownLanguage`（GFM 込みの
  `Language`）を拡張として直接渡せば木を振り落とせる。今の束に対して素の数で約 19%・gzip で
  約 23% 増える
- **`happy-dom` で起こせる。** `EditorView` を `happy-dom` の `document.body` に作り、
  `dispatch` で文面と選択を書き換え、`.cm-content` の字を読めた（`requestAnimationFrame` を
  用意すれば足りた）。打鍵と IME の再現は `happy-dom` ではできないので、E2E に任せる
- **E2E の張り方が素直。** 面は `.cm-content`（`contenteditable`）で、Playwright の
  `locator(".cm-content").click()`・`keyboard.type`・`press("Meta+Enter")` がそのまま効く

### 採らない案

- **Milkdown**: ProseMirror の WYSIWYG で、書いた記号が消えて装飾だけが残る。「記号は残り」と
  いう決定に合わない。記号を残す作り方は用意されていない
- **自作の重ね描き**: `<textarea>` を透かし、後ろに同じ字を色付きで描く。IME も補完も今のまま
  使えるが、**字の幅を変える装飾（見出しの大きさ・太字）を入れた途端に前後の字とキャレットが
  ずれる**。色だけなら作れるが、それは「見出し・太字がその場で装飾される」に届かない

## IME

**両立する。** Chrome（Playwright が起こす `channel: "chrome"`、headless）に CodeMirror 6 の
最小構成を置き、CDP の `Input.imeSetComposition` → `Input.insertText` で日本語を確定させた:

- `# ` のあとで「に → にほ → にほん → 日本」と変換して確定すると、文面は `# 日本`、行全体に
  見出しの class が付いた
- 改行して `**` のあとで「ふ → ふと → 太字」と確定し `**` を閉じると、`**太字**` に太字の class が
  付き、続けて確定した「か」は装飾の外に出た
- 変換中の `Meta+Enter` は送信の処理へ届かず、確定後の `Meta+Enter` は届いた

CodeMirror 6 は変換中の DOM を書き換えない作りで、装飾（`Decoration.mark`）は確定のあとに
付け直る。**記号を隠す置き換え（`Decoration.replace`）を使わない**ことが、IME との相性をさらに
安全側に置く（変換中のキャレットの前後で DOM の形が変わらない）。

**確かめていないこと**: 実機の IME（macOS の日本語入力）での打鍵。CDP の合成入力は
`keydown` の `isComposing` / `keyCode === 229` を実機と同じ形では出さないので、変換確定の
Command+Enter を送らない判定は実機で目視する（判定そのものは `isComposingEvent` をそのまま使う）。
Orca の中のブラウザタブ（Chromium）での動作も未確認。

## 下書きの持ち主

**`use-composer.ts` の `draft: { text, caret }` を唯一の持ち主のまま残す。** `<textarea>` も
エディタも、下書きを受け取って映し、打たれたら新しい `Draft` を返す「面」になる。モードを切り
替えると面を差し替えるだけなので、下書き・添えた画像・補完の状態は切り替えをまたいで残る。

### `HTMLTextAreaElement` 依存の切り方

`textAreaRef: RefObject<HTMLTextAreaElement | null>` を、面の型の ref に替える:

```ts
/** 入力欄の面（`<textarea>` とエディタ）。下書きの外で、use-composer.ts が触るのはこれだけ。 */
export type ComposerSurface = {
  readonly focus: () => void
  /** いまの選択の位置（打っていない間にキャレットを動かしたぶんも含む）。 */
  readonly caret: () => number
  readonly placeCaret: (caret: number) => void
}
```

- `ComposerChange` は `Draft` そのもの（`{ text, caret }`）にする。`<textarea>` の面は
  `event.target.value` と `selectionStart` から、エディタの面は `EditorView.updateListener` の
  `docChanged` から組み立てて渡す
- `ComposerKey` は `KeyboardEvent<HTMLTextAreaElement>` から型を借りるのをやめ、見るもの
  （`key`・`ctrlKey`・`metaKey`・`keyCode`・`isComposing`・`preventDefault`）を平らに持つ。
  React の合成イベントとエディタの素の `KeyboardEvent` のどちらからも作れる形にする
- `onKeyDown` は「処理したか」を `boolean` で返す（`use-suggestion.ts` の `onKeyDown` と同じ形）。
  `<textarea>` の面は捨て、エディタの面はそれを `domEventHandlers` の戻り値にして、処理した
  キーをエディタの keymap へ流さない
- 今の `useEffect`（React が `value` を書いたあとキャレットを戻す）は、`ComposerSurface` の
  `caret()` / `placeCaret()` を呼ぶ形でそのまま残る（「React の外にある状態への書き込み」）

### エディタの面の中の同期

`presentational-composer.tsx` から切り出す面の部品（`<textarea>` の面・エディタの面）の中に
閉じる。`useEffect` は4類型に収まる:

| やること                                         | 類型・代替                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| `EditorView` を作って壊す                        | 外部システムの購読（`useEffect` の中で作り、cleanup で `destroy()`） |
| 外で変わった下書き（確定・送信後の空）を書き写す | React の外にある状態への書き込み（文面が違うときだけ `dispatch`）    |
| プレースホルダの差し替え（質問の間）             | React の外にある状態への書き込み（`Compartment` の `reconfigure`）   |
| エディタのリスナから最新の `onChange` などを読む | `useEffectEvent`（作った1回のリスナが、描画ごとの呼び先を読む）      |

`EditorView` は作るときに `draft.text` と `draft.caret` で始めるので、`<textarea>` から切り替えた
直後も同じ位置にキャレットが立つ。打った結果はエディタ → `onChange` → `setDraft` → 書き写しの
effect で「文面が同じ」と分かって止まるので往復しない。

**エディタの取り消し履歴はモードを切り替えると消える**（`<textarea>` の取り消しも React が
`value` を書くたびに途切れるので、今と同じ程度）。

## 補完の候補窓とキー

- **位置は変えない。** 候補一覧は入力欄の包みの下端に底を合わせる絶対配置で、キャレットの座標を
  使っていない。エディタの面も同じ包みの中に置けば、候補窓は同じ場所に出る
- **キーはエディタの最優先（`Prec.highest`）の `keydown` 1つで受ける。** そこから
  `use-composer.ts` の `onKeyDown` へ渡し、`true` なら CodeMirror の keymap へ流さない。
  CodeMirror の既定の keymap は ↑↓・Enter・Escape・macOS の `Ctrl-n` / `Ctrl-p`（キャレット移動）を
  持っているが、候補が出ている間だけこちらが先に取るので、`<textarea>` のときと同じ「出ている間
  だけ奪う」振る舞いになる
- **既定の keymap から `Mod-Enter` を外す。** CodeMirror の `defaultKeymap` は `Mod-Enter` に
  `insertBlankLine` を持つ。送信の判定（変換中は送らない）を通って `false` が返った場合にも
  空行が入らないよう、keymap に載せる前に機械的に取り除く
- Tab は既定の keymap に無い（`indentWithTab` を入れない）ので、補完の確定とぶつからない。
  候補が出ていないときの Tab はブラウザのフォーカス移動のまま（`<textarea>` と同じ）
- `/`・`@` のボタンは `ComposerSurface.caret()` を読むので、面の違いを知らないまま動く

## 画像の貼り付け・ドロップ

エディタの `domEventHandlers` の `paste` / `dragover` / `drop` を、`use-prompt-image.ts` の
`onPaste` / `onDragOver` / `onDrop` へそのまま渡す。3つとも「画像のときだけ `preventDefault`
する」契約なので、エディタの面は `event.defaultPrevented` を戻り値にして、画像を取ったときだけ
CodeMirror の既定（字の挿入）へ流さない。字の貼り付け・字のドラッグは CodeMirror の既定のまま。
型は `Pick<ClipboardEvent, ...>` で、素の DOM のイベントもそのまま渡せる。

## 切り替えの口と、覚えるか

- **道具の行に切り替えのボタンを1つ置く**（画像・`/`・`@` の口と同じ `variant="ghost"`、
  押した状態を `pressed` で示す）。**キーは付けない**: Command+何かは Orca とブラウザの
  ショートカットとぶつかりやすく、決まっていること（ボタン・キー・どちらでもよい）の中で
  付けなくても足りる。要るとなったら、入力欄にフォーカスがあるときだけ効くキーを後から足す
- **覚える。** 置き場所は利用者の端末の設定として `localStorage`。演出の速さ
  （`browser/domain/reveal-speed.ts`）と同じ並びで `browser/domain/` に1ファイル置き、読めない・
  欠けた値は `<textarea>` へ畳む。サーバの `~/.tsukumo/state.json` には置かない（端末ごとの好みで、
  セッションの既定ではない）
- **既定は `<textarea>`。** 今の振る舞いと E2E の DOM の写し17件をそのまま保つため

## 入力欄の他の状態との併存

- **質問の間の自由入力**（`docs/display.md` 4.2）: 帯・プレースホルダ・枠の色・送るボタンの字は
  `ComposerModel` の `band` / `placeholder` / `answering` が決め、面はそれを映すだけ。エディタの
  面はプレースホルダを `@codemirror/view` の `placeholder` 拡張で出し、枠の色は包みの class で
  効かせる
- **送信のあと空にする**: `setDraft(EMPTY_DRAFT)` をエディタの面が書き写しの effect で映す
- **ターン進行中**: 送信を止める判定は `use-composer.ts` にあるので面に依らない
- **`required`**: `<textarea>` の `required` はエディタに無いが、送信は空白だけの下書きをもともと
  送らないので挙動は変わらない
- **答え待ちの箱（許可要求）・タスクの実行の確認**: 入力欄を経由しないので影響しない
- **狭い画面**: 面の大きさは包みに合わせるだけで、配置は変えない

## 装飾の範囲

付けるのは字の大きさ・太さ・色・等幅だけで、**記号を隠さず、行の高さを大きく変えない**
（入力欄は画面の一角で、見出しで行が伸びすぎると書いている行が押し出される）。

- 見出し（`#` 〜 `###`）: 字を一段大きく・太く。4以降は太字だけ
- 太字・斜体・取り消し線: そのまま
- インラインのコードとコードフェンス: 等幅（`--font-mono`）と地の色を一段
- リンク・引用・リストの印: 色だけ
- 記号（`#`・`**`・`` ` ``・`>` など）: 字の色を `--ink-quiet` に落とす
- 表は装飾しない（等幅にしないと桁が揃わず、揃えるには入力欄が狭い）

色はすべて `src/browser/styles/theme.css` の変数から取り、`HighlightStyle` は class だけを付けて
中身を CSS Modules に書く（色をコードに書かない）。

## 実装の広がり

- **足す依存**: `@codemirror/state`・`@codemirror/view`・`@codemirror/commands`・
  `@codemirror/language`・`@codemirror/lang-markdown`・`@lezer/highlight` の6つ（npm のライブラリで、
  外部コマンドではない）。`@codemirror/lang-markdown` は `@codemirror/lang-html` などを
  依存に引くが、`markdown()` を呼ばなければ束には入らない
- **作り替え**: `use-composer.ts` は ref の型・`ComposerKey`・`ComposerChange`・`onKeyDown` の
  戻り値の4点。`use-suggestion.ts` は `ComposerKey` の型を借りているだけなので、型が変わるのに
  付いていくだけ。`use-prompt-image.ts` はフォーカスの戻し先の名前だけ。新しく面の部品2つ
  （`<textarea>` の面・エディタの面）と、モードを覚える `browser/domain/` の1ファイル
- **置き場所**: CodeMirror はホストでも外部コマンドでもないブラウザ側のライブラリなので、
  サーバの `adapter/` の規則には当たらない。エディタの面の部品の中にだけ import を閉じる
- **テスト**: 単体はモードを覚える値の読み戻し（壊れた値を畳む）。E2E は1ファイルに3つ程度
  （切り替えて下書きが残る・エディタで Command+Enter で送る・エディタで `/` の補完を Enter で
  確定する）。**エディタのモードの DOM を写しに残すなら、`scenario-run.ts` で `.cm-editor` の
  子を辿らない**（CodeMirror が付ける `ͼ` の class と行の分け方を写しに入れない）
- **順番**: まず面の型を切り出して `<textarea>` だけで今のテストを通し（振る舞いは変えない）、
  そのあとにエディタの面と切り替えを足すと、差分が2段に割れて読みやすい

## 確かめていないこと

- 実機の IME（macOS の日本語入力）での変換確定と Command+Enter（上の「IME」）
- Orca の中のブラウザタブでの CodeMirror の動作
- 足したあとの tsukumo 全体の束の数（上の数は候補だけを組んだもの。React などは重ならないので
  足し算でおおよそ合うはずだが、組んで測ってはいない）
- 画像の貼り付けとドロップを CodeMirror の中で受けたときの振る舞い（イベントの形からは効くはず
  だが、実物では試していない）
