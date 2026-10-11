package expo.modules.closetlocalai

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors
import kotlin.math.abs

/**
 * Dependency-free Android companion for the local AI module.
 *
 * iOS ships the heavier Apple Vision + Stable Diffusion runtime. Android keeps
 * this path completely offline and deterministic: it removes a near-uniform
 * background, samples a dominant colour and exposes one isolated foreground
 * instance. No network model or Play service is required to open the app.
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

  private fun loadBitmap(value: String): Bitmap = BitmapFactory.decodeFile(value.removePrefix("file://"))
    ?: throw IllegalArgumentException("No se pudo leer la fotografía.")

  private fun file(value: String): String = if (value.startsWith("file:")) value else "file://$value"

  private fun save(bitmap: Bitmap, destination: String) {
    val target = File(destination.removePrefix("file://"))
    target.parentFile?.mkdirs()
    FileOutputStream(target).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
  }

  private fun removeNearBackground(source: Bitmap): Bitmap {
    val width = source.width
    val height = source.height
    val points = intArrayOf(source.getPixel(0, 0), source.getPixel(width - 1, 0), source.getPixel(0, height - 1), source.getPixel(width - 1, height - 1))
    val background = intArrayOf(points.map { Color.red(it) }.average().toInt(), points.map { Color.green(it) }.average().toInt(), points.map { Color.blue(it) }.average().toInt())
    val pixels = IntArray(width * height)
    source.getPixels(pixels, 0, width, 0, 0, width, height)
    pixels.indices.forEach { index ->
      val pixel = pixels[index]
      val distance = abs(Color.red(pixel) - background[0]) + abs(Color.green(pixel) - background[1]) + abs(Color.blue(pixel) - background[2])
      val alpha = if (distance < 42 && isEdgeLike(index, width, height)) 0 else 255
      pixels[index] = Color.argb(alpha, Color.red(pixel), Color.green(pixel), Color.blue(pixel))
    }
    return Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
  }

  private fun isEdgeLike(index: Int, width: Int, height: Int): Boolean {
    val x = index % width
    val y = index / width
    return x < width * .18 || x > width * .82 || y < height * .12 || y > height * .92
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
