import UIKit

/// アプリ全体で1つだけ持つもの(小窓、拡張機能からの受信、対戦の状態)
final class AppState: ObservableObject {
    let pip = PiPController()
    let receiver = BroadcastReceiver()
    let frames = FrameReceiver()
    let updater = EngineUpdater()
    let logger = BattleLogger()

    /// 対戦の状態は計算エンジンの中にあるので、対戦中はエンジンを入れ替えない
    private(set) var battleActive = false

    @Published private(set) var view: PipViewModel = .message("画面収録を開始するか、計算タブで対面を選んでください")
    @Published private(set) var image: UIImage = PipRenderer.render(.message("画面収録を開始するか、計算タブで対面を選んでください"))
    /// 画面の読み取りで最後に分かったこと(動作確認タブに表示)
    @Published private(set) var lastScreenMode = "-"
    @Published private(set) var lastScreenInputs: [String] = []

    private var started = false

    func start() {
        guard !started else { return }
        started = true
        receiver.onInputs = { [weak self] inputs in
            self?.feed(inputs)
        }
        receiver.start()
        frames.onObservations = { [weak self] obs in
            self?.screen(obs)
        }
        frames.start()
        pip.imageProvider = { [weak self] in
            self?.image ?? PipRenderer.render(.message("待機中"))
        }
        pip.onSkipBack = { [weak self] in self?.turnPage(["me": 1]) }
        pip.onSkipForward = { [weak self] in self?.turnPage(["opp": 1]) }
        pip.onPlayPause = { [weak self] in self?.turnPage(["reset": true]) }
        pip.setup()

        updater.canSwitchNow = { [weak self] in !(self?.battleActive ?? false) }
        updater.onSwitched = { [weak self] in self?.refresh() }
        updater.check()
    }

    /// 自分のパーティを計算エンジンに渡す(画面の読み取りで対戦が始まったときに使う)
    func setParty(_ party: [Member]) {
        _ = EngineBridge.shared.call("setParty", ["party": party.map { battleDict($0) }])
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

    /// 画面の文字認識の結果を渡す
    func screen(_ observations: [TextObservation]) {
        battleActive = true
        guard let r = EngineBridge.shared.call("screenRead", ["observations": observations.map { $0.dict }]) as? [String: Any] else { return }
        lastScreenMode = r["mode"] as? String ?? "-"
        let inputs = (r["inputs"] as? [[String: Any]]) ?? []
        logger.record(mode: lastScreenMode, newBattle: r["newBattle"] as? Bool ?? false, observations: observations, inputs: inputs)
        if !inputs.isEmpty {
            let lines = inputs.map { i -> String in
                [i["kind"], i["side"], i["name"], i["text"], i["percent"], i["cur"]]
                    .compactMap { $0.map { "\($0)" } }.joined(separator: " ")
            }
            lastScreenInputs = Array((lines + lastScreenInputs).prefix(30))
            refresh()
        }
    }

    /// 小窓のページを切り替える(me: 自分の交代先 / opp: 相手の控え / reset: 場の対面へ)
    func turnPage(_ input: [String: Any]) {
        _ = EngineBridge.shared.call("pipPage", input)
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
