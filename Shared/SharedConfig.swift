import Foundation

/// 本体アプリと画面録画の拡張機能で共通に使う設定
enum SharedConfig {
    /// 拡張機能 → 本体アプリへ、状況の文字を端末内通信(UDP)で送るときのポート番号
    static let udpPort: UInt16 = 50555

    /// 拡張機能 → 本体アプリへ、画面の画像を端末内通信(TCP)で送るときのポート番号
    static let framePort: UInt16 = 50556

    /// 画面を送る間隔(秒)と、送る画像の横幅
    static let frameInterval: TimeInterval = 0.5
    static let frameWidth: CGFloat = 1600

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

    /// 画像1枚分の送信データ:長さ(4バイト、ビッグエンディアン)+ JPEG
    static func frameMessage(_ jpeg: Data) -> Data {
        var length = UInt32(jpeg.count).bigEndian
        var out = Data(bytes: &length, count: 4)
        out.append(jpeg)
        return out
    }
}
