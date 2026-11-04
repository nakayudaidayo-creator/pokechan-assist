import Foundation

/// アプリ全体で1つだけ持つもの(小窓、拡張機能からの受信、小窓に出す内容)
final class AppState: ObservableObject {
    let pip = PiPController()
    let receiver = BroadcastReceiver()

    @Published var pipLines: [String] = ["ポケチャン補助", "計算タブで対面を選ぶと", "ここに結果が出ます"]

    private var started = false

    func start() {
        guard !started else { return }
        started = true
        receiver.start()
        pip.linesProvider = { [weak self] in
            self?.pipLines ?? []
        }
        pip.setup()
    }
}
