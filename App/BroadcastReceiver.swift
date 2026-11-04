import Foundation
import Network

/// 画面録画の拡張機能から端末内通信(UDP)で送られてくる内容を受け取る。
/// JSON(読み取った入力の配列)なら onInputs に渡し、それ以外は状況表示として扱う。
final class BroadcastReceiver: ObservableObject {
    @Published var lastMessage = "まだ受信なし"
    @Published var receivedCount = 0
    @Published var status = "停止中"

    /// 読み取った入力の配列([{"kind":"telop","text":"…"}, …])を受け取ったとき
    var onInputs: (([[String: Any]]) -> Void)?

    private var listener: NWListener?

    func start() {
        guard listener == nil else { return }
        do {
            let params = NWParameters.udp
            params.requiredInterfaceType = .loopback
            let port = NWEndpoint.Port(rawValue: SharedConfig.udpPort) ?? 50555
            let newListener = try NWListener(using: params, on: port)
            newListener.stateUpdateHandler = { [weak self] state in
                DispatchQueue.main.async {
                    switch state {
                    case .ready: self?.status = "待受中"
                    case .failed(let error): self?.status = "待受失敗: \(error)"
                    case .cancelled: self?.status = "停止中"
                    default: break
                    }
                }
            }
            newListener.newConnectionHandler = { [weak self] connection in
                connection.start(queue: .main)
                self?.receive(on: connection)
            }
            newListener.start(queue: .main)
            listener = newListener
        } catch {
            status = "待受失敗: \(error)"
        }
    }

    private func receive(on connection: NWConnection) {
        connection.receiveMessage { [weak self] data, _, _, error in
            if let data {
                self?.handle(data)
            }
            if error == nil {
                self?.receive(on: connection)
            }
        }
    }

    private func handle(_ data: Data) {
        receivedCount += 1
        if let inputs = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] {
            lastMessage = "読み取り \(inputs.count)件"
            if !inputs.isEmpty { onInputs?(inputs) }
        } else if let text = String(data: data, encoding: .utf8) {
            lastMessage = text
        }
    }
}
