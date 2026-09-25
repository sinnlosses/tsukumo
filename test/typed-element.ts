// クエリで拾った DOM 要素を `instanceof` で具体クラスへ絞り込む。テストの前提（「この要素は
// `<select>` になっている」など）が崩れたら、その場で投げて教える
// （docs/coding-standards.md「型を迂回するキャストを使わない」節の「テストの DOM 要素のキャスト」）。

/**
 * `value` が `ctor` のインスタンスであることを確かめてから返す。合わなければ `description` を
 * 添えて投げる。`screen.getByLabelText` / `document.querySelector` / 配列の添字アクセスなど、
 * 型としては `Element | null | undefined` や `unknown` で返ってくる値を、テストの前提どおりの
 * 具体クラスとして扱いたいときに使う。
 */
export function typedElement<T extends Element>(
  value: unknown,
  ctor: new () => T,
  description: string,
): T {
  if (!(value instanceof ctor)) {
    throw new Error(`${description}になっていない`)
  }
  return value
}
