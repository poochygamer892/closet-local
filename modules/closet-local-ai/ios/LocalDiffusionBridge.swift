import Foundation
import UIKit
import CoreML
import StableDiffusion

@objc(LocalDiffusionBridge)
public final class LocalDiffusionBridge: NSObject {
  @objc public static func generate(_ payload: NSDictionary) -> NSString? {
    guard #available(iOS 16.2, *), let source = payload["source"] as? String, let destination = payload["destination"] as? String, let prompt = payload["prompt"] as? String, let input = UIImage(contentsOfFile: URL(string: source)?.path ?? source)?.cgImage, let resources = Bundle.main.resourceURL?.appendingPathComponent("StableDiffusion") else { return nil }
    do {
      let configuration = MLModelConfiguration(); configuration.computeUnits = .cpuAndNeuralEngine
      var request = PipelineConfiguration(prompt: prompt)
      request.startingImage = input; request.strength = 0.42; request.stepCount = 24; request.guidanceScale = 6.5
      request.negativePrompt = "person, body, face, hands, mannequin, hanger, room, background, text, watermark"
      let pipeline = try StableDiffusionPipeline(resourcesAt: resources, controlNet: [], configuration: configuration, disableSafety: true, reduceMemory: true)
      try pipeline.loadResources()
      guard let image = try pipeline.generateImages(configuration: request, progressHandler: { _ in true }).first ?? nil, let data = UIImage(cgImage: image).pngData() else { return nil }
      let url = URL(string: destination) ?? URL(fileURLWithPath: destination)
      try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      try data.write(to: url, options: .atomic)
      return url.absoluteString as NSString
    } catch { return nil }
  }
}
