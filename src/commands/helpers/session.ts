/**
 * セッションのコレクター
 * 扱うインタラクションの種類はセッションごとに違うため、止めることと終了を受け取ることだけを求める
 */
interface SessionCollector {
	stop(reason?: string): void;
	once(event: "end", listener: () => void): unknown;
}

// 範囲ごと・種類ごとに、今操作できるセッションのコレクター
// 範囲（ルームなど）がなくなれば、そのセッションの記録も一緒に片付く
const sessions = new WeakMap<object, Map<string, SessionCollector>>();

/**
 * 同じ範囲で同じ種類のセッションを、新しいセッションに置き換える
 * 前のセッションのコレクターは理由 "replaced" で止まるため、ボタンの取り除きなどはコレクターの終了時に行う
 * 最新のものだけを操作できるようにしたいセッションだけが、コレクターを作ったときに呼ぶ
 * 記録はメモリにだけ持つ。Bot の再起動でコレクターごと消え、古いボタンは期限切れになる
 *
 * @param scope 最新を決める範囲（ルームなど）
 * @param kind セッションの種類（"team" など）。種類が違えば互いに止めない
 */
export function replaceSession(scope: object, kind: string, collector: SessionCollector): void {
	let byKind = sessions.get(scope);
	if (!byKind) {
		byKind = new Map();
		sessions.set(scope, byKind);
	}

	byKind.get(kind)?.stop("replaced");
	byKind.set(kind, collector);

	const records = byKind;
	collector.once("end", () => {
		if (records.get(kind) === collector) records.delete(kind);
	});
}
