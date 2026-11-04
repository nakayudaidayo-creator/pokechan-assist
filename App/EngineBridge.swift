import Foundation
import JavaScriptCore

/// 計算エンジン(JavaScript)を JavaScriptCore で動かし、Swift から呼び出す窓口。
/// 呼び出しはメインスレッドからだけ行う。
final class EngineBridge {
    static let shared = EngineBridge()

    private let context: JSContext
    private(set) var loadError: String?
    private(set) var lastError: String?

    private init() {
        context = JSContext()!
        context.exceptionHandler = { [weak self] _, exception in
            self?.lastError = exception?.toString()
        }
        if let url = Bundle.main.url(forResource: "pokechan-engine", withExtension: "js"),
           let source = try? String(contentsOf: url, encoding: .utf8) {
            context.evaluateScript(source)
            if context.objectForKeyedSubscript("pokechanCall")?.isUndefined ?? true {
                loadError = "計算エンジンの読み込みに失敗しました: \(lastError ?? "原因不明")"
            }
        } else {
            loadError = "計算エンジンのファイルが見つかりません"
        }
    }

    /// エンジンの関数を呼び、結果("ok" の中身)を返す。失敗時は nil
    func call(_ name: String, _ input: Any = [String: Any]()) -> Any? {
        guard loadError == nil,
              let data = try? JSONSerialization.data(withJSONObject: input),
              let json = String(data: data, encoding: .utf8),
              let function = context.objectForKeyedSubscript("pokechanCall"),
              let output = function.call(withArguments: [name, json])?.toString(),
              let outputData = output.data(using: .utf8),
              let object = (try? JSONSerialization.jsonObject(with: outputData)) as? [String: Any]
        else { return nil }
        if let error = object["error"] as? String {
            lastError = error
            return nil
        }
        return object["ok"]
    }

    /// 結果を型に変換して返す
    func decode<T: Decodable>(_ name: String, _ input: Any = [String: Any](), as type: T.Type) -> T? {
        guard let value = call(name, input),
              let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed])
        else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
}
