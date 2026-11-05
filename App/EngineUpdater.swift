import Foundation
import CryptoKit

/// 起動時に GitHub 上の最新の計算エンジンを確かめ、新しければ取り込む。
/// 通信できない・中身が壊れている・読み込めないときは、今の版のまま使い続ける。
final class EngineUpdater: ObservableObject {
    @Published private(set) var status = "未確認"
    @Published private(set) var lastChecked: Date?

    /// 取り込んだ版を、対戦中でなければすぐに使うかどうかを決めるために呼ぶ
    var canSwitchNow: () -> Bool = { true }
    /// 新しい版に切り替えた後に呼ばれる
    var onSwitched: () -> Void = {}

    private let base = URL(string: "https://raw.githubusercontent.com/nakayudaidayo-creator/pokechan-assist/main/App/Resources/")!
    private var checking = false

    func check() {
        guard !checking else { return }
        checking = true
        status = "確認中…"
        Task {
            let result = await fetchNewer()
            await MainActor.run {
                self.apply(result)
                self.lastChecked = Date()
                self.checking = false
            }
        }
    }

    private enum Result {
        case upToDate
        case newer(EngineSource, EngineSource.VersionFile)
        case failed(String)
    }

    private func fetchNewer() async -> Result {
        let current = EngineBridge.shared.version
        do {
            let (vdata, vres) = try await URLSession.shared.data(from: base.appendingPathComponent("engine-version.json"))
            guard (vres as? HTTPURLResponse)?.statusCode == 200 else { return .failed("版の情報を取得できませんでした") }
            let remote = try JSONDecoder().decode(EngineSource.VersionFile.self, from: vdata)
            guard remote.version > current else { return .upToDate }

            let (code, cres) = try await URLSession.shared.data(from: base.appendingPathComponent("pokechan-engine.js"))
            guard (cres as? HTTPURLResponse)?.statusCode == 200 else { return .failed("計算エンジンを取得できませんでした") }
            let sha = SHA256.hash(data: code).map { String(format: "%02x", $0) }.joined()
            guard sha == remote.sha256 else { return .failed("取得したファイルが壊れていました(取得中に更新された可能性があります)") }
            guard let text = String(data: code, encoding: .utf8) else { return .failed("取得したファイルを読めませんでした") }
            return .newer(EngineSource(code: text, version: remote.version, origin: "GitHubから取得"), remote)
        } catch {
            return .failed("通信できませんでした")
        }
    }

    @MainActor
    private func apply(_ result: Result) {
        switch result {
        case .upToDate:
            status = "最新です(版 \(EngineBridge.shared.version)・\(EngineBridge.shared.origin))"
        case .failed(let message):
            status = "\(message)。今の版(\(EngineBridge.shared.version))を使います"
        case .newer(let source, let file):
            // 読み込めることを確かめてから保存する
            guard EngineBridge.makeContext(source.code) != nil else {
                status = "新しい版(\(file.version))を読み込めなかったので、今の版を使います"
                return
            }
            do {
                try EngineSource.save(code: source.code, version: file)
            } catch {
                status = "新しい版を保存できませんでした"
                return
            }
            if canSwitchNow(), EngineBridge.shared.load(source) {
                status = "新しい版(\(file.version))に更新しました"
                onSwitched()
            } else {
                status = "新しい版(\(file.version))を取得しました。次にアプリを開いたときに切り替わります"
            }
        }
    }
}
