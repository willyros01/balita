// Generate all Wire Android launcher icons from the exact icon-512.png
// used by build/ios-build.sh. No third-party image dependencies are needed.
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.Ellipse2D;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.imageio.ImageIO;

class AndroidIcons {
  private static BufferedImage resized(BufferedImage source, int size, Color bg,
                                       boolean circle, double scale) {
    BufferedImage image = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
    Graphics2D g = image.createGraphics();
    try {
      g.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
          RenderingHints.VALUE_INTERPOLATION_BICUBIC);
      g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
      if (circle) {
        g.setClip(new Ellipse2D.Double(0, 0, size, size));
      }
      g.setColor(bg);
      g.fillRect(0, 0, size, size);
      int inset = (int) Math.round(size * (1 - scale) / 2);
      g.drawImage(source, inset, inset, size - inset, size - inset, null);
    } finally {
      g.dispose();
    }
    return image;
  }

  private static void writePng(Path target, BufferedImage source) throws IOException {
    Files.createDirectories(target.getParent());
    if (!ImageIO.write(source, "png", target.toFile())) {
      throw new IOException("PNG encoder unavailable: " + target);
    }
    BufferedImage decoded = ImageIO.read(target.toFile());
    if (decoded == null || decoded.getWidth() != source.getWidth()
        || decoded.getHeight() != source.getHeight()) {
      throw new IOException("Icon validation failed: " + target);
    }
    System.out.println("Wrote " + target + " (" + source.getWidth() + "px)");
  }

  private static void writeXml(Path target, String xml) throws IOException {
    Files.createDirectories(target.getParent());
    Files.writeString(target, xml);
  }

  public static void main(String[] args) throws Exception {
    if (args.length != 2) {
      throw new IllegalArgumentException("Usage: java build/AndroidIcons.java icon-512.png android/app/src/main/res");
    }
    Path sourceFile = Path.of(args[0]);
    Path res = Path.of(args[1]);
    BufferedImage original = ImageIO.read(sourceFile.toFile());
    if (original == null || original.getWidth() < 512
        || original.getHeight() != original.getWidth()) {
      throw new IOException("Wire logo must be a square PNG at least 512 px: " + sourceFile);
    }

    // The iOS Wire source icon has an opaque blue background. Keep that same
    // blue underneath Android's shape mask; do not create a different logo.
    Color background = new Color(original.getRGB(0, 0), false);
    String color = String.format("#%02X%02X%02X",
        background.getRed(), background.getGreen(), background.getBlue());
    LinkedHashMap<String,Integer> density = new LinkedHashMap<>();
    density.put("mdpi", 1);
    density.put("hdpi", 3); // 1.5x; handled below with integer 2x factor
    density.put("xhdpi", 2);
    density.put("xxhdpi", 3);
    density.put("xxxhdpi", 4);

    for (String name : density.keySet()) {
      double factor = switch (name) {
        case "hdpi" -> 1.5;
        case "xhdpi" -> 2.0;
        case "xxhdpi" -> 3.0;
        case "xxxhdpi" -> 4.0;
        default -> 1.0;
      };
      Path dir = res.resolve("mipmap-" + name);
      int legacy = (int) Math.round(48 * factor);
      int adaptive = (int) Math.round(108 * factor);
      // Legacy icon is the full, unchanged iOS artwork scaled to platform size.
      writePng(dir.resolve("ic_launcher.png"),
          resized(original, legacy, background, false, 1));
      writePng(dir.resolve("ic_launcher_round.png"),
          resized(original, legacy, background, true, 1));
      // Android masks the outer 18dp of adaptive icons. A little interior padding
      // protects the bowl and coins from being cropped on circular launchers.
      writePng(dir.resolve("ic_launcher_foreground.png"),
          resized(original, adaptive, background, false, 0.94));
    }

    String xmlHeader = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n";
    String adaptiveXml = xmlHeader +
        "<adaptive-icon xmlns:android=\"http://schemas.android.com/apk/res/android\">\n" +
        "  <background android:drawable=\"@drawable/ic_launcher_background\" />\n" +
        "  <foreground android:drawable=\"@mipmap/ic_launcher_foreground\" />\n" +
        "</adaptive-icon>\n";
    Path anydpi = res.resolve("mipmap-anydpi-v26");
    writeXml(anydpi.resolve("ic_launcher.xml"), adaptiveXml);
    writeXml(anydpi.resolve("ic_launcher_round.xml"), adaptiveXml);
    writeXml(res.resolve("drawable/ic_launcher_background.xml"),
        xmlHeader + "<shape xmlns:android=\"http://schemas.android.com/apk/res/android\">\n" +
        "  <solid android:color=\"" + color + "\" />\n</shape>\n");
    System.out.println("All Android icon densities and adaptive masks generated from " + sourceFile);
  }
}
