import Foundation
import UIKit
import CoreML
import StableDiffusion

@objc(LocalDiffusionBridge)
public final class LocalDiffusionBridge: NSObject {
  @objc public static func generate(_ payload: NSDictionary) -> NSString? {
    guard #available(iOS 16.2, *), let sources = payload["sources"] as? [String], !sources.isEmpty, let destination = payload["destination"] as? String, let prompt = payload["prompt"] as? String, let input = Self.referenceImage(sources), let resources = Bundle.main.resourceURL?.appendingPathComponent("StableDiffusion") else { return nil }
    do {
      let configuration = MLModelConfiguration(); configuration.computeUnits = .cpuAndNeuralEngine
      var request = PipelineConfiguration(prompt: prompt)
      request.startingImage = input
      // The reference is only a visual guide. A high img2img strength is
      // intentional here: lower values copy the person wearing the item.
      request.strength = 0.92; request.stepCount = 40; request.guidanceScale = 8.0
      request.negativePrompt = "person, human, body, torso, legs, face, head, hands, arms, feet, skin, mannequin, hanger, model, wearer, room, mirror, background clutter, text, watermark"
      let pipeline = try StableDiffusionPipeline(resourcesAt: resources, controlNet: [], configuration: configuration, disableSafety: true, reduceMemory: true)
      try pipeline.loadResources()
      guard let image = try pipeline.generateImages(configuration: request, progressHandler: { _ in true }).first ?? nil, let data = UIImage(cgImage: image).pngData() else { return nil }
      let url = Self.localURL(destination)
      try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      try data.write(to: url, options: .atomic)
      return url.absoluteString as NSString
    } catch { return nil }
  }

  private static func localURL(_ value: String) -> URL {
    if let url = URL(string: value), url.isFileURL { return url }
    return URL(fileURLWithPath: value)
  }

  /// Make a small reference board from the front/back/detail crops. Stable
  /// Diffusion receives all views at once, while the generated output remains
  /// a single clean flat-lay product photograph.
  private static func referenceImage(_ values: [String]) -> CGImage? {
    let images = values.prefix(4).compactMap { UIImage(contentsOfFile: localURL($0).path) }
    guard !images.isEmpty else { return nil }
    let columns = images.count == 1 ? 1 : 2
    let rows = Int(ceil(Double(images.count) / Double(columns)))
    let canvas = CGSize(width: 512, height: 512)
    UIGraphicsBeginImageContextWithOptions(canvas, false, 1)
    defer { UIGraphicsEndImageContext() }
    UIColor.white.setFill()
    UIRectFill(CGRect(origin: .zero, size: canvas))
    let cellWidth = canvas.width / CGFloat(columns)
    let cellHeight = canvas.height / CGFloat(rows)
    for (index, image) in images.enumerated() {
      let cell = CGRect(x: CGFloat(index % columns) * cellWidth, y: CGFloat(index / columns) * cellHeight, width: cellWidth, height: cellHeight).insetBy(dx: 8, dy: 8)
      let scale = min(cell.width / image.size.width, cell.height / image.size.height)
      let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
      let rect = CGRect(x: cell.midX - size.width / 2, y: cell.midY - size.height / 2, width: size.width, height: size.height)
      image.draw(in: rect)
    }
    return UIGraphicsGetImageFromCurrentImageContext()?.cgImage
  }
}
