import Foundation
import UIKit
import CoreML
import StableDiffusion

@objc(LocalDiffusionBridge)
public final class LocalDiffusionBridge: NSObject {
  @objc public static func generate(_ payload: NSDictionary) -> NSString? {
    guard #available(iOS 16.2, *), let source = payload["source"] as? String, let destination = payload["destination"] as? String, let prompt = payload["prompt"] as? String, let input = UIImage(contentsOfFile: Self.localURL(source).path)?.cgImage, let resources = Bundle.main.resourceURL?.appendingPathComponent("StableDiffusion") else { return nil }
    do {
      let configuration = MLModelConfiguration(); configuration.computeUnits = .cpuAndNeuralEngine
      var request = PipelineConfiguration(prompt: prompt)
      request.startingImage = input
      // Keep the reference crop as a visual guide, but let the local model
      // redraw it as a flat product photograph instead of copying the wearer.
      request.strength = 0.78; request.stepCount = 32; request.guidanceScale = 7.5
      request.negativePrompt = "person, human, body, torso, legs, face, head, hands, arms, feet, skin, mannequin, hanger, model, room, mirror, background clutter, text, watermark"
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
}
