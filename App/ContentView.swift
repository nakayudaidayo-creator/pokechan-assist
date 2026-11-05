import SwiftUI
import ReplayKit
import AVKit

/// 一番外側の画面:上に小窓の元画像と操作、下にタブ
struct ContentView: View {
    @StateObject private var state = AppState()
    @StateObject private var party = PartyStore()

    var body: some View {
        VStack(spacing: 0) {
            PiPBar(pip: state.pip)
            TabView {
                CalcView(state: state, party: party)
                    .tabItem { Label("計算", systemImage: "function") }
                PartyView(party: party)
                    .tabItem { Label("パーティ", systemImage: "person.3") }
                DiagnosticsView(receiver: state.receiver, updater: state.updater)
                    .tabItem { Label("動作確認", systemImage: "wrench.and.screwdriver") }
            }
        }
        .onAppear { state.start() }
    }
}

/// 小窓の元になる表示と、開始・停止のボタン
struct PiPBar: View {
    @ObservedObject var pip: PiPController

    var body: some View {
        HStack(spacing: 12) {
            PiPLayerView(displayLayer: pip.displayLayer)
                .frame(width: 120, height: 100)
                .background(Color.black)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Button("小窓を開始") { pip.start() }
                        .buttonStyle(.borderedProminent)
                    Button("停止") { pip.stop() }
                        .buttonStyle(.bordered)
                }
                Text(pip.isActive ? "小窓:表示中" : "小窓:停止中")
                    .font(.footnote)
                if let error = pip.lastError {
                    Text(error).font(.caption).foregroundColor(.red)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
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

/// 動作確認:画面録画の開始と、拡張機能からの受信状況
struct DiagnosticsView: View {
    @ObservedObject var receiver: BroadcastReceiver
    @ObservedObject var updater: EngineUpdater

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                GroupBox("画面録画") {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("丸いボタンを押し、「ポケチャン補助 読み取り」を選んで「ブロードキャストを開始」")
                            .font(.footnote)
                        BroadcastPickerView()
                            .frame(width: 60, height: 60)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                GroupBox("拡張機能からの受信") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("状態: \(receiver.status) / 受信 \(receiver.receivedCount)件")
                        Text(receiver.lastMessage).font(.footnote).foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                GroupBox("計算エンジン") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(EngineBridge.shared.loadError ?? "版 \(EngineBridge.shared.version)(\(EngineBridge.shared.origin))")
                        Text("更新の確認:\(updater.status)")
                            .font(.footnote).foregroundColor(.secondary)
                        Button("今すぐ更新を確認") { updater.check() }
                            .buttonStyle(.bordered)
                    }
                    .font(.footnote)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding()
        }
    }
}
