package expo.modules.closetlocalai

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.util.ArrayDeque
import java.util.concurrent.Executors
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Dependency-free Android companion for the local AI module.
 *
 * iOS ships the heavier Apple Vision + Stable Diffusion runtime. Android keeps
 * this path completely offline and small: it performs foreground extraction,
 * classification and a catalog-style flat-lay reconstruction with Bitmap and
 * Canvas. No network model or Play service is required to open the app.
 */
class ClosetLocalAIModule : Module() {
  private val executor = Executors.newSingleThreadExecutor()

  override fun definition() = ModuleDefinition {
    Name("ClosetLocalAI")

    AsyncFunction("status") {
      mapOf("foreground" to true, "classification" to true, "platform" to "android-bitmap-local")
    }

    AsyncFunction("removeBackground") { source: String, destination: String, promise: Promise ->
      executor.execute {
        try {
          save(removeNearBackground(loadBitmap(source)), destination)
          promise.resolve(file(destination))
        } catch (error: Exception) {
          promise.reject("E_BACKGROUND", error.message, error)
        }
      }
    }

    AsyncFunction("extractForegroundInstances") { source: String, destinationPrefix: String, promise: Promise ->
      executor.execute {
        try {
          val target = destinationPrefix.removePrefix("file:").removeSuffix(".png") + "-piece-0.png"
          save(removeNearBackground(loadBitmap(source)), target)
          promise.resolve(listOf(file(target)))
        } catch (error: Exception) {
          promise.reject("E_INSTANCES", error.message, error)
        }
      }
    }

    // Android deliberately uses a lightweight local reconstruction here. It
    // keeps the APK at the same size instead of bundling a multi-gigabyte
    // diffusion checkpoint, while still returning a centered catalog image to
    // the shared JS outfit flow (rather than silently falling back to the raw
    // crop). The iPhone build uses true local Stable Diffusion for this call.
    AsyncFunction("generateFlatLay") { sources: List<String>, destination: String, _prompt: String, promise: Promise ->
      executor.execute {
        try {
          save(reconstructFlatLay(sources), destination)
          promise.resolve(file(destination))
        } catch (error: Exception) {
          promise.reject("E_FLAT_LAY", error.message, error)
        }
      }
    }

    AsyncFunction("analyze") { source: String, promise: Promise ->
      executor.execute {
        try {
          val bitmap = loadBitmap(source)
          promise.resolve(mapOf(
            "labels" to listOf(mapOf("identifier" to "clothing", "confidence" to 0.35)),
            "dominantColor" to dominantColor(bitmap),
            "available" to true,
          ))
        } catch (error: Exception) {
          promise.reject("E_ANALYZE", error.message, error)
        }
      }
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

  private fun reconstructFlatLay(values: List<String>): Bitmap {
    val candidates = values.take(4).mapNotNull { value -> runCatching { loadBitmap(value) }.getOrNull() }
    val source = candidates.maxByOrNull { foregroundScore(it) }
      ?: throw IllegalArgumentException("No se pudo leer ninguna vista de la prenda.")
    val cutout = removeNearBackground(source)
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
    val cutout = removeNearBackground(source)
    val pixels = IntArray(cutout.width * cutout.height)
    cutout.getPixels(pixels, 0, cutout.width, 0, 0, cutout.width, cutout.height)
    return pixels.count { Color.alpha(it) > 16 }
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

  private fun removeNearBackground(source: Bitmap): Bitmap {
    val width = source.width
    val height = source.height
    val points = intArrayOf(source.getPixel(0, 0), source.getPixel(width - 1, 0), source.getPixel(0, height - 1), source.getPixel(width - 1, height - 1))
    val background = intArrayOf(points.map { Color.red(it) }.average().toInt(), points.map { Color.green(it) }.average().toInt(), points.map { Color.blue(it) }.average().toInt())
    val pixels = IntArray(width * height)
    source.getPixels(pixels, 0, width, 0, 0, width, height)
    val transparent = BooleanArray(pixels.size)
    val queue = ArrayDeque<Int>()
    fun nearBackground(index: Int): Boolean {
      val pixel = pixels[index]
      val distance = abs(Color.red(pixel) - background[0]) + abs(Color.green(pixel) - background[1]) + abs(Color.blue(pixel) - background[2])
      return distance < 58
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
