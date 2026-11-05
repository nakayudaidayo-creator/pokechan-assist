import Foundation
import Network
import UIKit
import Vision

/// 文字認識した1かたまり(座標は横向き画面の左上を0、右下を1とした割合)
struct TextObservation {
    var text: String
    var x: Double
    var y: Double
    var w: Double
    var h: Double
    var conf: Double

    var dict: [String: Any] { ["text": text, "x": x, "y": y, "w": w, "h": h, "conf": conf] }
}

/// 日本語の文字認識(画面の読み取りとパーティの取り込みで共通に使う)
enum TextRecognizer {
    /// 時間がかかるので、メインスレッド以外で呼ぶ
    static func recognize(_ cg: CGImage) -> [TextObservation] {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["ja-JP", "en-US"]
        request.usesLanguageCorrection = false
        request.minimumTextHeight = 0.012
        var results: [TextObservation] = []
        do {
            try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
            for o in request.results ?? [] {
                guard let c = o.topCandidates(1).first else { continue }
                let b = o.boundingBox  // 左下が原点
                results.append(TextObservation(text: c.string, x: b.minX, y: 1 - b.maxY, w: b.width, h: b.height, conf: Double(c.confidence)))
            }
        } catch {
            return []
        }
        return results
    }
}

/// 拡張機能から画面の画像を受け取り、日本語の文字認識をして結果を渡す。
/// 文字認識が終わる前に次の画像が届いたら、古い方は捨てて最新だけを処理する。
final class FrameReceiver: ObservableObject {
    @Published private(set) var status = "停止中"
    @Published private(set) var framesReceived = 0
    @Published private(set) var lastImage: UIImage?
    @Published private(set) var lastLines: [String] = []
    @Published private(set) var lastOCRMillis = 0

    /// 文字認識の結果を受け取る(メインスレッドで呼ばれる)
    var onObservations: (([TextObservation]) -> Void)?

    private var listener: NWListener?
    private let ocrQueue = DispatchQueue(label: "ocr", qos: .userInitiated)
    private var busy = false
    private var pending: Data?

    func start() {
        guard listener == nil else { return }
        do {
            let params = NWParameters.tcp
            params.requiredInterfaceType = .loopback
            let port = NWEndpoint.Port(rawValue: SharedConfig.framePort) ?? 50556
            let l = try NWListener(using: params, on: port)
            l.stateUpdateHandler = { [weak self] state in
                DispatchQueue.main.async {
                    switch state {
                    case .ready: self?.status = "待受中"
                    case .failed(let e): self?.status = "待受失敗: \(e)"
                    case .cancelled: self?.status = "停止中"
                    default: break
                    }
                }
            }
            l.newConnectionHandler = { [weak self] conn in
                conn.start(queue: .global(qos: .userInitiated))
                self?.receive(conn, buffer: Data())
                DispatchQueue.main.async { self?.status = "拡張機能と接続中" }
            }
            l.start(queue: .main)
            listener = l
        } catch {
            status = "待受失敗: \(error)"
        }
    }

    /// 長さ(4バイト)+ JPEG の並びを読み取る
    private func receive(_ conn: NWConnection, buffer: Data) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 1 << 20) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            var buf = buffer
            if let data { buf.append(data) }
            while buf.count >= 4 {
                let len = buf.prefix(4).reduce(0) { ($0 << 8) | Int($1) }
                guard len > 0, len < 10_000_000 else { buf.removeAll(); break }
                guard buf.count >= 4 + len else { break }
                let jpeg = buf.subdata(in: 4..<(4 + len))
                buf.removeSubrange(0..<(4 + len))
                self.enqueue(jpeg)
            }
            if isComplete || error != nil {
                conn.cancel()
                DispatchQueue.main.async { self.status = "待受中(拡張機能の接続が切れました)" }
                return
            }
            self.receive(conn, buffer: buf)
        }
    }

    private func enqueue(_ jpeg: Data) {
        ocrQueue.async {
            if self.busy {
                self.pending = jpeg
                return
            }
            self.process(jpeg)
        }
    }

    /// ocrQueue の上で動く
    private func process(_ jpeg: Data) {
        busy = true
        let started = Date()
        guard let image = UIImage(data: jpeg), let cg = image.cgImage else {
            finish()
            return
        }
        let results = TextRecognizer.recognize(cg)
        let millis = Int(Date().timeIntervalSince(started) * 1000)
        let lines = results.sorted { ($0.y, $0.x) < ($1.y, $1.x) }
            .map { String(format: "%@ (x%.2f y%.2f h%.3f)", $0.text, $0.x, $0.y, $0.h) }

        DispatchQueue.main.async {
            self.framesReceived += 1
            self.lastImage = image
            self.lastLines = lines
            self.lastOCRMillis = millis
            self.onObservations?(results)
        }
        finish()
    }

    private func finish() {
        busy = false
        if let next = pending {
            pending = nil
            process(next)
        }
    }
}
