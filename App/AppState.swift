import UIKit

/// アプリ全体で1つだけ持つもの(小窓、拡張機能からの受信、対戦の状態)
final class AppState: ObservableObject {
    let pip = PiPController()
    let receiver = BroadcastReceiver()
    let updater = EngineUpdater()

    /// 対戦の状態は計算エンジンの中にあるので、対戦中はエンジンを入れ替えない
    private(set) var battleActive = false

    @Published private(set) var view: PipViewModel = .message("画面収録を開始するか、計算タブで対面を選んでください")
    @Published private(set) var image: UIImage = PipRenderer.render(.message("画面収録を開始するか、計算タブで対面を選んでください"))

    private var started = false

    func start() {
        guard !started else { return }
        started = true
        receiver.onInputs = { [weak self] inputs in
            self?.feed(inputs)
        }
        receiver.start()
        pip.imageProvider = { [weak self] in
            self?.image ?? PipRenderer.render(.message("待機中"))
        }
        pip.setup()

        updater.canSwitchNow = { [weak self] in !(self?.battleActive ?? false) }
        updater.onSwitched = { [weak self] in self?.refresh() }
        updater.check()
    }

    /// 対戦を始める(自分のパーティと、分かっていれば相手の6匹)
    func startBattle(party: [Member], opponentTeam: [String]) {
        let members = party.map { battleDict($0) }
        _ = EngineBridge.shared.call("battleStart", ["party": members, "opponentTeam": opponentTeam])
        battleActive = true
        refresh()
    }

    /// 画面から読み取った入力を渡す({"kind":"telop","text":"…"} など)
    func feed(_ inputs: [[String: Any]]) {
        _ = EngineBridge.shared.call("battleFeed", inputs)
        refresh()
    }

    func refresh() {
        if let v = EngineBridge.shared.decode("pipView", as: PipViewModel.self) {
            view = v
        } else {
            view = .message(EngineBridge.shared.loadError ?? EngineBridge.shared.lastError ?? "計算できませんでした")
        }
        image = PipRenderer.render(view)
    }

    /// バトル状態に渡すパーティの1匹(最大HPのために実数値も付ける)
    private func battleDict(_ m: Member) -> [String: Any] {
        var d = m.engineInput()
        d["species"] = m.species
        if let stats = EngineBridge.shared.call("stats", m.engineInput()) as? [String: Any] {
            d["stats"] = stats
        }
        return d
    }
}
