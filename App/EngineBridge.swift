import Foundation
import JavaScriptCore

/// 計算エンジン(JavaScript)を JavaScriptCore で動かし、Swift から呼び出す窓口。
/// 呼び出しはメインスレッドからだけ行う。
///
/// エンジンは「アプリに入っている版」と「GitHub から取ってきて保存した版」のうち、
/// 版番号が大きい方を使う(EngineUpdater 参照)。
final class EngineBridge {
    static let shared = EngineBridge()

    private var context: JSContext!
    private(set) var loadError: String?
    private(set) var lastError: String?
    /// 今動いているエンジンの版番号と、どこから読んだか
    private(set) var version: Int = 0
    private(set) var origin: String = "-"

    private init() {
        let bundled = EngineSource.bundled()
        let cached = EngineSource.cached()
        if let cached, cached.version > (bundled?.version ?? 0), load(cached) {
            return
        }
        if let bundled, load(bundled) {
            return
        }
        loadError = "計算エンジンのファイルが見つかりません"
    }

    /// 別の版のエンジンに切り替える。読み込めなければ今の版のまま false を返す
    @discardableResult
    func load(_ source: EngineSource) -> Bool {
        guard let test = EngineBridge.makeContext(source.code) else { return false }
        context = test
        version = source.version
        origin = source.origin
        loadError = nil
        lastError = nil
        return true
    }

    /// エンジンを読み込んで、最低限の呼び出しができるか確かめる
    static func makeContext(_ code: String) -> JSContext? {
        guard let ctx = JSContext() else { return nil }
        var failed = false
        ctx.exceptionHandler = { _, _ in failed = true }
        ctx.evaluateScript(code)
        guard !failed,
              let fn = ctx.objectForKeyedSubscript("pokechanCall"), !fn.isUndefined,
              let out = fn.call(withArguments: ["speciesList", "{}"])?.toString(),
              out.hasPrefix("{\"ok\":[")
        else { return nil }
        return ctx
    }

    /// エンジンの関数を呼び、結果("ok" の中身)を返す。失敗時は nil
    func call(_ name: String, _ input: Any = [String: Any]()) -> Any? {
        guard loadError == nil, let context,
              let data = try? JSONSerialization.data(withJSONObject: input, options: [.fragmentsAllowed]),
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

/// 計算エンジンの本体と版番号
struct EngineSource {
    var code: String
    var version: Int
    var origin: String

    struct VersionFile: Codable {
        var version: Int
        var sha256: String
    }

    /// アプリに入っている版
    static func bundled() -> EngineSource? {
        guard let url = Bundle.main.url(forResource: "pokechan-engine", withExtension: "js"),
              let code = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        var version = 0
        if let vurl = Bundle.main.url(forResource: "engine-version", withExtension: "json"),
           let data = try? Data(contentsOf: vurl),
           let v = try? JSONDecoder().decode(VersionFile.self, from: data) {
            version = v.version
        }
        return EngineSource(code: code, version: version, origin: "アプリ内")
    }

    /// GitHub から取ってきて保存した版
    static func cached() -> EngineSource? {
        guard let code = try? String(contentsOf: cacheURL(), encoding: .utf8),
              let data = try? Data(contentsOf: cacheVersionURL()),
              let v = try? JSONDecoder().decode(VersionFile.self, from: data) else { return nil }
        return EngineSource(code: code, version: v.version, origin: "GitHubから取得")
    }

    static func save(code: String, version: VersionFile) throws {
        let dir = cacheURL().deletingLastPathComponent()
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try code.write(to: cacheURL(), atomically: true, encoding: .utf8)
        try JSONEncoder().encode(version).write(to: cacheVersionURL(), options: .atomic)
    }

    static func cacheURL() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("engine/pokechan-engine.js")
    }

    static func cacheVersionURL() -> URL {
        cacheURL().deletingLastPathComponent().appendingPathComponent("engine-version.json")
    }
}
