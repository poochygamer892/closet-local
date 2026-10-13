package com.google.mediapipe.tasks.vision.imagegenerator;

import com.google.mediapipe.calculator.proto.StableDiffusionIterateCalculatorOptionsProto;
import com.google.mediapipe.tasks.core.ErrorListener;
import com.google.mediapipe.tasks.vision.imagegenerator.proto.ImageGeneratorGraphOptionsProto;
import com.google.protobuf.Any;
import java.util.Optional;

/**
 * The public MediaPipe builder hard-codes Stable Diffusion output to 512x512.
 * That tensor arena is too large for a number of Android phones. Keep the
 * same model and text generation path, but request a 256x256 latent/output
 * image so the native allocator stays below its 192 MiB pool cap.
 */
public final class LowMemoryImageGeneratorOptions extends ImageGenerator.ImageGeneratorOptions {
  private static final String TYPE_URL =
      "type.googleapis.com/mediapipe.tasks.vision.image_generator.proto.ImageGeneratorGraphOptions";

  private final String modelDirectory;
  private final ModelType modelType;

  public LowMemoryImageGeneratorOptions(String modelDirectory, ModelType modelType) {
    this.modelDirectory = modelDirectory;
    this.modelType = modelType;
  }

  @Override
  String imageGeneratorModelDirectory() {
    return modelDirectory;
  }

  @Override
  Optional<String> loraWeightsFilePath() {
    return Optional.empty();
  }

  @Override
  ModelType modelType() {
    return modelType;
  }

  @Override
  Optional<ErrorListener> errorListener() {
    return Optional.empty();
  }

  @Override
  public Any convertToAnyProto() {
    StableDiffusionIterateCalculatorOptionsProto.StableDiffusionIterateCalculatorOptions iterate =
        StableDiffusionIterateCalculatorOptionsProto.StableDiffusionIterateCalculatorOptions
            .newBuilder()
            .setBaseSeed(0)
            .setFileFolder(modelDirectory)
            .setModelType(
                StableDiffusionIterateCalculatorOptionsProto.StableDiffusionIterateCalculatorOptions
                    .ModelType.SD_1)
            .setOutputImageWidth(256)
            .setOutputImageHeight(256)
            .setEmitEmptyPacket(true)
            .setShowEveryNIteration(100)
            .build();

    ImageGeneratorGraphOptionsProto.ImageGeneratorGraphOptions options =
        ImageGeneratorGraphOptionsProto.ImageGeneratorGraphOptions.newBuilder()
            .setText2ImageModelDirectory(modelDirectory)
            .setStableDiffusionIterateOptions(iterate)
            .build();

    return Any.newBuilder()
        .setTypeUrl(TYPE_URL)
        .setValue(options.toByteString())
        .build();
  }
}
