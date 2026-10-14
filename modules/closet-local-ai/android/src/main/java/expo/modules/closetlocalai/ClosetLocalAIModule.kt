package expo.modules.closetlocalai

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.content.Context
import com.google.mediapipe.tasks.vision.imagegenerator.ImageGenerator
import com.google.mediapipe.tasks.vision.imagegenerator.LowMemoryImageGeneratorOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.io.BufferedInputStream
import java.util.zip.ZipInputStream
import java.util.ArrayDeque
import java.util.concurrent.Executors
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Android implementation of the local AI module.
 *
 * Foreground extraction and lightweight classification stay dependency-free,
 * while flat-lay generation uses the selected source views. The local build
 * still bundles `sd15.zip` for the future image-conditioned runtime, but this
 * module never uses text-only generation because it cannot see the photos.
 */
class ClosetLocalAIModule : Module() {
  private val executor = Executors.newSingleThreadExecutor()
  private val generatorLock = Any()
  @Volatile private var diffusionGenerator: ImageGenerator? = null
  @Volatile private var diffusionDirectory: File? = null

  override fun definition() = ModuleDefinition {
    Name("ClosetLocalAI")

    AsyncFunction("status") {
      mapOf(
        "foreground" to true,
        "classification" to true,
        "generation" to true,
        "generationMode" to "source-aware-reference-reconstruction",
        "platform" to "android-local-ai",
      )
    }

    AsyncFunction("removeBackground") { source: String, destination: String, promise: Promise ->
      executor.execute {
        try {
          save(cutoutForGarment(loadBitmap(source)), destination)
          promise.resolve(file(destination))
        } catch (error: Exception) {
          promise.reject("E_BACKGROUND", error.message, error)
        }
      }
    }

    AsyncFunction("extractForegroundInstances") { source: String, destinationPrefix: String, promise: Promise ->
      executor.execute {
        try {
          val base = destinationPrefix.removePrefix("file:").removeSuffix(".png")
          val pieces = splitForegroundInstances(loadBitmap(source))
          if (pieces.isEmpty()) throw IllegalArgumentException("No se detectaron prendas separadas.")
          val outputs = pieces.mapIndexed { index, bitmap ->
            val target = "$base-piece-$index.png"
            save(bitmap, target)
            file(target)
          }
          promise.resolve(outputs)
        } catch (error: Exception) {
          promise.reject("E_INSTANCES", error.message, error)
        }
      }
    }

    AsyncFunction("generateFlatLay") { sources: List<String>, destination: String, _prompt: String, promise: Promise ->
      executor.execute {
        try {
          // MediaPipe 0.10.20 exposes text-to-image here. Its generate()
          // overload does not consume the supplied photos, so using it for an
          // outfit produced unrelated scenes (including houses and furniture)
          // in the wardrobe. Until an image-conditioned model is bundled,
          // always use the source-aware reconstruction below.
          save(reconstructFlatLay(sources), destination)
          promise.resolve(file(destination))
        } catch (error: Exception) {
          promise.reject("E_FLAT_LAY", error.message, error)
        }
      }
    }

    AsyncFunction("fallbackFlatLay") { sources: List<String>, destination: String, promise: Promise ->
      executor.execute {
        try {
          save(reconstructFlatLay(sources), destination)
          promise.resolve(file(destination))
        } catch (error: Exception) {
          promise.reject("E_FALLBACK", error.message, error)
        }
      }
    }

    AsyncFunction("analyze") { source: String, promise: Promise ->
      executor.execute {
        try {
          val bitmap = loadBitmap(source)
          promise.resolve(mapOf(
            "labels" to basicLabels(bitmap),
            "dominantColor" to dominantColor(bitmap),
            "available" to true,
          ))
        } catch (error: Exception) {
          promise.reject("E_ANALYZE", error.message, error)
        }
      }
    }
  }

  /**
   * A deterministic Android fallback for category hints. It is deliberately
   * conservative and low-confidence: users can always correct the category,
   * but a flat-lay shoe or trouser should not arrive as a generic top just
   * because Android has no bundled image-classification model.
   */
  private fun basicLabels(source: Bitmap): List<Map<String, Any>> {
    val cutout = cutoutForGarment(source)
    val bounds = opaqueBounds(cutout)
    if (bounds.isEmpty) return listOf(mapOf("identifier" to "clothing", "confidence" to 0.2))
    val foreground = foregroundScore(source).toFloat() / (source.width * source.height).toFloat()
    val ratio = bounds.width().toFloat() / bounds.height().toFloat()
    val maxDimension = max(source.width, source.height).toFloat()
    val small = max(bounds.width(), bounds.height()) < maxDimension * .45f
    return when {
      ratio > 2.0f && bounds.height() < source.height * .45f -> listOf(
        mapOf("identifier" to "footwear", "confidence" to 0.58),
        mapOf("identifier" to "clothing", "confidence" to 0.25),
      )
      ratio < .58f && bounds.height() > bounds.width() * 1.6f -> listOf(
        mapOf("identifier" to "trouser", "confidence" to 0.48),
        mapOf("identifier" to "clothing", "confidence" to 0.3),
      )
      small && foreground < .14f -> listOf(
        mapOf("identifier" to "accessory", "confidence" to 0.42),
        mapOf("identifier" to "clothing", "confidence" to 0.25),
      )
      else -> listOf(mapOf("identifier" to "clothing", "confidence" to 0.35))
    }
  }

  private fun loadBitmap(value: String): Bitmap {
    val path = value.removePrefix("file://")
    val bounds = BitmapFactory.Options().also { it.inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw IllegalArgumentException("No se pudo leer la fotografía.")
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / sample > 1024) sample *= 2
    val options = BitmapFactory.Options().also {
      it.inSampleSize = sample
      it.inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    return BitmapFactory.decodeFile(path, options) ?: throw IllegalArgumentException("No se pudo leer la fotografía.")
  }

  private fun file(value: String): String = if (value.startsWith("file:")) value else "file://$value"

  private fun save(bitmap: Bitmap, destination: String) {
    val target = File(destination.removePrefix("file://"))
    target.parentFile?.mkdirs()
    FileOutputStream(target).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
  }

  /**
   * Splits disconnected foreground islands after the inexpensive edge flood
   * fill. This is intentionally conservative: it is much safer to return two
   * clean pieces than to manufacture dozens of tiny fragments from texture.
   */
  private fun splitForegroundInstances(source: Bitmap): List<Bitmap> {
    val cutout = removeNearBackground(source)
    val width = cutout.width
    val height = cutout.height
    val pixels = IntArray(width * height)
    cutout.getPixels(pixels, 0, width, 0, 0, width, height)
    val visited = BooleanArray(pixels.size)
    val minimumArea = max(120, pixels.size / 200)
    val bounds = mutableListOf<Pair<Rect, Int>>()

    for (index in pixels.indices) {
      if (visited[index] || Color.alpha(pixels[index]) <= 16) continue
      val queue = ArrayDeque<Int>()
      queue.add(index)
      visited[index] = true
      var area = 0
      var left = width
      var top = height
      var right = 0
      var bottom = 0
      while (queue.isNotEmpty()) {
        val current = queue.removeFirst()
        val x = current % width
        val y = current / width
        area++
        left = min(left, x)
        top = min(top, y)
        right = max(right, x + 1)
        bottom = max(bottom, y + 1)
        val neighbours = intArrayOf(
          if (x > 0) current - 1 else -1,
          if (x + 1 < width) current + 1 else -1,
          if (y > 0) current - width else -1,
          if (y + 1 < height) current + width else -1,
        )
        for (neighbour in neighbours) {
          if (neighbour >= 0 && !visited[neighbour] && Color.alpha(pixels[neighbour]) > 16) {
            visited[neighbour] = true
            queue.add(neighbour)
          }
        }
      }
      if (area >= minimumArea) bounds.add(Rect(left, top, right, bottom) to area)
    }

    if (bounds.isEmpty()) return emptyList()
    return bounds.sortedByDescending { it.second }.take(8).map { (box, _) ->
      val padding = max(8, min(width, height) / 40)
      val left = max(0, box.left - padding)
      val top = max(0, box.top - padding)
      val right = min(width, box.right + padding)
      val bottom = min(height, box.bottom + padding)
      Bitmap.createBitmap(cutout, left, top, max(1, right - left), max(1, bottom - top))
    }
  }

  private fun androidContext(): Context =
    appContext.reactContext ?: throw IllegalStateException("No se pudo acceder al contexto Android.")

  /**
   * Expands the bundled model lazily. Keeping this out of application startup
   * avoids the black-screen/crash behaviour when the user only opens the
   * wardrobe; the first generation can take a few minutes on a phone.
   */
  private fun ensureDiffusionDirectory(context: Context): File {
    diffusionDirectory?.let { if (File(it, ".complete").exists()) return it }
    synchronized(generatorLock) {
      diffusionDirectory?.let { if (File(it, ".complete").exists()) return it }
      val directory = File(context.filesDir, "closet-local-ai/sd15")
      val marker = File(directory, ".complete")
      if (!marker.exists()) {
        val asset = runCatching { context.assets.open("models/sd15.zip") }.getOrNull()
          ?: throw IllegalStateException(
            "Falta el modelo Stable Diffusion de Android (models/sd15.zip). " +
              "Genera el APK con scripts/build-android-local.sh."
          )
        directory.mkdirs()
        ZipInputStream(BufferedInputStream(asset)).use { zip ->
          val buffer = ByteArray(1024 * 1024)
          while (true) {
            val entry = zip.nextEntry ?: break
            val target = File(directory, entry.name)
            val root = directory.canonicalFile
            if (!target.canonicalFile.path.startsWith(root.path + File.separator)) {
              throw IllegalStateException("Entrada de modelo inválida.")
            }
            if (entry.isDirectory) {
              target.mkdirs()
            } else {
              target.parentFile?.mkdirs()
              FileOutputStream(target).use { output ->
                while (true) {
                  val read = zip.read(buffer)
                  if (read <= 0) break
                  output.write(buffer, 0, read)
                }
              }
            }
            zip.closeEntry()
          }
        }
        marker.writeText("stable-diffusion-v1-5-mediapipe")
      }
      diffusionDirectory = directory
      return directory
    }
  }

  private fun diffusionGenerator(context: Context, directory: File): ImageGenerator {
    diffusionGenerator?.let { return it }
    synchronized(generatorLock) {
      diffusionGenerator?.let { return it }
      val options = LowMemoryImageGeneratorOptions(
        directory.absolutePath,
        ImageGenerator.ImageGeneratorOptions.ModelType.SD_1,
      )
      return ImageGenerator.createFromOptions(context, options).also { diffusionGenerator = it }
    }
  }

  private fun reconstructFlatLay(values: List<String>): Bitmap {
    val candidates = values.take(4).mapNotNull { value -> runCatching { loadBitmap(value) }.getOrNull() }
    val source = candidates.maxByOrNull { foregroundScore(it) }
      ?: throw IllegalArgumentException("No se pudo leer ninguna vista de la prenda.")
    val cutout = cutoutForGarment(source)
    val bounds = opaqueBounds(cutout)
    if (bounds.isEmpty) return cutout

    val size = 768
    val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(output)
    canvas.drawColor(Color.rgb(249, 248, 246))
    val scale = min((size * .86f) / bounds.width().toFloat(), (size * .86f) / bounds.height().toFloat())
    val width = bounds.width() * scale
    val height = bounds.height() * scale
    val target = RectF((size - width) / 2f, (size - height) / 2f, (size + width) / 2f, (size + height) / 2f)
    canvas.drawBitmap(cutout, bounds, target, Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
    return output
  }

  private fun foregroundScore(source: Bitmap): Int {
    val primary = removeNearBackground(source, 65)
    val primaryBounds = opaqueBounds(primary)
    val primaryArea = if (primaryBounds.isEmpty) 0 else primaryBounds.width() * primaryBounds.height()
    if (primaryArea >= max(256, source.width * source.height / 100)) return primaryArea
    val conservative = removeNearBackground(source, 35)
    val conservativeBounds = opaqueBounds(conservative)
    val conservativeArea = if (conservativeBounds.isEmpty) 0 else conservativeBounds.width() * conservativeBounds.height()
    return max(primaryArea, conservativeArea)
  }

  /**
   * Keep a source view usable even when the background and garment have similar
   * colours. The old border palette included clothing that touched the crop
   * edge, so flood-fill could erase the entire garment and leave a tiny speck.
   */
  private fun cutoutForGarment(source: Bitmap): Bitmap {
    val primary = removeNearBackground(source, 65)
    val primaryBounds = opaqueBounds(primary)
    val minimumArea = max(256, source.width * source.height / 100)
    val primaryArea = if (primaryBounds.isEmpty) 0 else primaryBounds.width() * primaryBounds.height()
    if (primaryArea >= minimumArea) return primary

    val conservative = removeNearBackground(source, 35)
    val conservativeBounds = opaqueBounds(conservative)
    val conservativeArea = if (conservativeBounds.isEmpty) 0 else conservativeBounds.width() * conservativeBounds.height()
    if (conservativeArea >= minimumArea && conservativeArea > primaryArea) return conservative

    // A complete source is preferable to silently saving a microscopic
    // fragment. The JS layer still presents it for review, never as a claimed
    // high-confidence segmentation.
    return source.copy(Bitmap.Config.ARGB_8888, false)
  }

  private fun opaqueBounds(source: Bitmap): Rect {
    val pixels = IntArray(source.width * source.height)
    source.getPixels(pixels, 0, source.width, 0, 0, source.width, source.height)
    var left = source.width; var top = source.height; var right = -1; var bottom = -1
    pixels.forEachIndexed { index, pixel ->
      if (Color.alpha(pixel) > 16) {
        val x = index % source.width; val y = index / source.width
        left = min(left, x); top = min(top, y); right = max(right, x); bottom = max(bottom, y)
      }
    }
    return if (right < left || bottom < top) Rect() else Rect(left, top, right + 1, bottom + 1)
  }

  private fun removeNearBackground(source: Bitmap, threshold: Int): Bitmap {
    val width = source.width
    val height = source.height
    // Sample only corner patches. Sampling the whole border mistakes sleeves,
    // trousers or shoes that touch the crop edge for background colours.
    val patch = max(1, min(width, height) / 12)
    fun corner(left: Int, top: Int): Int {
      var red = 0; var green = 0; var blue = 0; var count = 0
      val endX = min(width, left + patch)
      val endY = min(height, top + patch)
      for (y in top until endY) for (x in left until endX) {
        val pixel = source.getPixel(x, y)
        red += Color.red(pixel); green += Color.green(pixel); blue += Color.blue(pixel); count++
      }
      return Color.rgb(red / max(1, count), green / max(1, count), blue / max(1, count))
    }
    val backgroundColors = listOf(
      corner(0, 0), corner(max(0, width - patch), 0),
      corner(0, max(0, height - patch)), corner(max(0, width - patch), max(0, height - patch)),
    )
    val pixels = IntArray(width * height)
    source.getPixels(pixels, 0, width, 0, 0, width, height)
    val transparent = BooleanArray(pixels.size)
    val queue = ArrayDeque<Int>()
    fun nearBackground(index: Int): Boolean {
      val pixel = pixels[index]
      return backgroundColors.any { sample ->
        abs(Color.red(pixel) - Color.red(sample)) +
          abs(Color.green(pixel) - Color.green(sample)) +
          abs(Color.blue(pixel) - Color.blue(sample)) < threshold
      }
    }
    fun add(index: Int) {
      if (!transparent[index] && nearBackground(index)) {
        transparent[index] = true
        queue.add(index)
      }
    }
    for (x in 0 until width) { add(x); add((height - 1) * width + x) }
    for (y in 0 until height) { add(y * width); add(y * width + width - 1) }
    while (queue.isNotEmpty()) {
      val index = queue.removeFirst(); val x = index % width; val y = index / width
      if (x > 0) add(index - 1)
      if (x + 1 < width) add(index + 1)
      if (y > 0) add(index - width)
      if (y + 1 < height) add(index + width)
    }
    pixels.indices.forEach { index ->
      val pixel = pixels[index]
      pixels[index] = Color.argb(if (transparent[index]) 0 else 255, Color.red(pixel), Color.green(pixel), Color.blue(pixel))
    }
    return Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
  }

  private fun dominantColor(bitmap: Bitmap): String {
    val sampled = Bitmap.createScaledBitmap(bitmap, 1, 1, true).getPixel(0, 0)
    val r = Color.red(sampled); val g = Color.green(sampled); val b = Color.blue(sampled)
    return when {
      maxOf(r, g, b) < 55 -> "Negro"
      minOf(r, g, b) > 205 -> "Blanco"
      maxOf(r, g, b) - minOf(r, g, b) < 25 -> "Gris"
      r > b + 35 && r > g + 20 -> if (g > 120) "Beige" else "Rojo"
      b > r + 25 && b > g -> "Azul"
      g > r + 20 && g > b -> "Verde"
      r > 115 && b > 80 -> "Morado"
      else -> "Marrón"
    }
  }
}
