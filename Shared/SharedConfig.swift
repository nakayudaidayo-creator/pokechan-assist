import Foundation

/// 本体アプリと画面録画の拡張機能で共通に使う設定
enum SharedConfig {
    /// 拡張機能 → 本体アプリへ端末内通信(UDP)で送るときのポート番号
    static let udpPort: UInt16 = 50555

    /// 拡張機能のバンドルIDの末尾
    static let extensionSuffix = ".Broadcast"

    /// App Group(共有領域)のID。
    /// 書き込みツールがバンドルIDを書き換える場合に備えて、実行時のバンドルIDから組み立てる。
    static func groupID() -> String {
        var id = Bundle.main.bundleIdentifier ?? ""
        if id.hasSuffix(extensionSuffix) {
            id = String(id.dropLast(extensionSuffix.count))
        }
        return "group." + id
    }

    /// 本体アプリのバンドルIDから、拡張機能のバンドルIDを組み立てる
    static func extensionBundleID() -> String {
        (Bundle.main.bundleIdentifier ?? "") + extensionSuffix
    }
}
