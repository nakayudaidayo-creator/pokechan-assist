import SwiftUI
import ReplayKit
import AVKit

/// 動作確認用の画面。
/// 確認すること:①小窓が出るか ②画面録画の拡張が動くか ③拡張から本体へ届くか(通信 / 共有領域)
struct ContentView: View {
    @StateObject private var pip = PiPController()
    @StateObject private var receiver = BroadcastReceiver()

    @State private var groupStatus = "未確認"
    @State private var groupMessage = "-"

    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("ポケチャン補助 動作確認")
                    .font(.title2).bold()

                GroupBox("① 小窓") {
                    VStack(alignment: .leading, spacing: 8) {
                        PiPLayerView(displayLayer: pip.displayLayer)
                            .frame(height: 120)
                            .background(Color.black)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        HStack {
                            Button("小窓を開始") { pip.start() }
                                .buttonStyle(.borderedProminent)
                            Button("小窓を停止") { pip.stop() }
                                .buttonStyle(.bordered)
                        }
                        Text("状態: \(pip.isActive ? "表示中" : "停止中")")
                        if let error = pip.lastError {
                            Text(error).foregroundColor(.red).font(.footnote)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                GroupBox("② 画面録画の拡張") {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("下の丸いボタンを押し、「ポケチャン補助 読み取り」を選んで「ブロードキャストを開始」")
                            .font(.footnote)
                        BroadcastPickerView()
                            .frame(width: 60, height: 60)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                GroupBox("③ 拡張から本体への受け渡し") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("通信(UDP): \(receiver.status) / 受信 \(receiver.receivedCount)件")
                        Text(receiver.lastMessage).font(.footnote).foregroundColor(.secondary)
                        Divider()
                        Text("共有領域(App Group): \(groupStatus)")
                        Text(groupMessage).font(.footnote).foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding()
        }
        .onAppear {
            receiver.start()
            pip.linesProvider = { [receiver] in
                let time = DateFormatter.localizedString(from: Date(), dateStyle: .none, timeStyle: .medium)
                return [
                    "ポケチャン補助",
                    "受信 \(receiver.receivedCount)件",
                    receiver.lastMessage,
                    "時刻 \(time)"
                ]
            }
            pip.setup()
            checkAppGroup()
        }
        .onReceive(ticker) { _ in
            checkAppGroup()
        }
    }

    private func checkAppGroup() {
        let id = SharedConfig.groupID()
        if FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id) == nil {
            groupStatus = "使えない"
            groupMessage = id
        } else {
            groupStatus = "使える"
            groupMessage = UserDefaults(suiteName: id)?.string(forKey: "lastMessage") ?? "まだ受信なし"
        }
    }
}

/// 小窓の元になる表示レイヤーを画面に置く
struct PiPLayerView: UIViewRepresentable {
    let displayLayer: AVSampleBufferDisplayLayer

    func makeUIView(context: Context) -> LayerHostView {
        let view = LayerHostView()
        view.hostedLayer = displayLayer
        return view
    }

    func updateUIView(_ uiView: LayerHostView, context: Context) {}
}

final class LayerHostView: UIView {
    var hostedLayer: CALayer? {
        didSet {
            oldValue?.removeFromSuperlayer()
            if let hostedLayer {
                layer.addSublayer(hostedLayer)
            }
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        hostedLayer?.frame = bounds
    }
}

/// 画面録画を開始するシステムのボタン
struct BroadcastPickerView: UIViewRepresentable {
    func makeUIView(context: Context) -> RPSystemBroadcastPickerView {
        let picker = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 60, height: 60))
        picker.preferredExtension = SharedConfig.extensionBundleID()
        picker.showsMicrophoneButton = false
        return picker
    }

    func updateUIView(_ uiView: RPSystemBroadcastPickerView, context: Context) {}
}
