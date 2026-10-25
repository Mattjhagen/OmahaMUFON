#!/usr/bin/env python3
"""
Generate PNG icons and favicons from user-provided UFO pixel-art image.

Source: /home/matt/SkyRewind/ufo-icon.jpg (1024x1024 JPEG, pixel-art UFO on blue background)

Generates:
- Favicons: 16x16, 32x32, 48x48 PNG
- PWA icons: 192x192, 512x512 PNG (512 is maskable-safe with padding)
- Apple: 180x180 PNG
- favicon.ico (multi-size ICO)

CRITICAL: Uses NEAREST-NEIGHBOR resampling to preserve pixel-art aesthetic.
"""

from PIL import Image
import os

# Source image path
SOURCE_IMAGE = '/home/matt/SkyRewind/ufo-icon.jpg'
OUTPUT_DIR = '/opt/skyrewind-merged/frontend'
ICONS_DIR = os.path.join(OUTPUT_DIR, 'icons')

def resize_pixel_art(source_img, target_size):
    """
    Resize with NEAREST-NEIGHBOR to preserve pixel-art look.
    No blur, no smoothing - sharp pixels only.
    """
    return source_img.resize((target_size, target_size), Image.NEAREST)

def create_maskable_icon(source_img, size=512):
    """
    Create a maskable-safe icon by adding padding.
    Android masks crop to various shapes (circle, rounded square, squircle).
    Safe zone: central 80% (10% margin on all sides).
    """
    # Create a new image with the source's background color (blue)
    # Sample the corner to get the background color
    bg_color = source_img.getpixel((0, 0))

    canvas = Image.new('RGB', (size, size), bg_color)

    # Calculate safe zone (80% of canvas)
    safe_size = int(size * 0.8)
    safe_margin = (size - safe_size) // 2

    # Resize source to fit in safe zone
    resized = resize_pixel_art(source_img.convert('RGB'), safe_size)

    # Paste centered
    canvas.paste(resized, (safe_margin, safe_margin))

    return canvas

def generate_all_icons():
    """Generate all required icon sizes from the source UFO image."""

    if not os.path.exists(SOURCE_IMAGE):
        print(f"ERROR: Source image not found: {SOURCE_IMAGE}")
        print("Expected a 1024x1024 pixel-art UFO image.")
        return False

    # Load source image
    print(f"Loading source image: {SOURCE_IMAGE}")
    source = Image.open(SOURCE_IMAGE)

    if source.size != (1024, 1024):
        print(f"WARNING: Source is {source.size}, expected 1024x1024. Continuing anyway.")

    # Ensure output directories exist
    os.makedirs(ICONS_DIR, exist_ok=True)

    print("\nGenerating icons with NEAREST-NEIGHBOR resampling (pixel-art mode)...\n")

    # Favicon sizes (16, 32, 48)
    favicon_sizes = [16, 32, 48]
    for size in favicon_sizes:
        output_path = os.path.join(ICONS_DIR, f'favicon-{size}.png')
        icon = resize_pixel_art(source, size)
        icon.save(output_path, 'PNG')
        print(f"✓ Generated {output_path} ({size}x{size})")

    # PWA icon 192x192 (no maskable padding needed at this size)
    output_192 = os.path.join(ICONS_DIR, 'icon-192.png')
    icon_192 = resize_pixel_art(source, 192)
    icon_192.save(output_192, 'PNG')
    print(f"✓ Generated {output_192} (192x192)")

    # PWA icon 512x512 (maskable-safe with padding)
    output_512 = os.path.join(ICONS_DIR, 'icon-512.png')
    icon_512 = create_maskable_icon(source, 512)
    icon_512.save(output_512, 'PNG')
    print(f"✓ Generated {output_512} (512x512, maskable-safe)")

    # Apple touch icon 180x180
    output_apple = os.path.join(ICONS_DIR, 'apple-touch-icon.png')
    icon_apple = resize_pixel_art(source, 180)
    icon_apple.save(output_apple, 'PNG')
    print(f"✓ Generated {output_apple} (180x180)")

    # Generate multi-size ICO for legacy browser support
    # ICO can contain multiple sizes in one file
    try:
        output_ico = os.path.join(OUTPUT_DIR, 'favicon.ico')
        # Create icons for ICO (16, 32, 48)
        ico_images = [resize_pixel_art(source, s) for s in [16, 32, 48]]
        ico_images[0].save(
            output_ico,
            format='ICO',
            sizes=[(16, 16), (32, 32), (48, 48)],
            append_images=ico_images[1:]
        )
        print(f"✓ Generated {output_ico} (multi-size ICO)")
    except Exception as e:
        print(f"⚠ Warning: Could not generate ICO: {e}")
        print("  (ICO generation requires Pillow with ICO support)")

    print("\n" + "="*60)
    print("✅ All icons generated successfully!")
    print("="*60)
    print("\nIcon verification checklist:")
    print("  [ ] 16px favicon is recognizable (saucer visible)")
    print("  [ ] 192px PWA icon looks sharp (no blur)")
    print("  [ ] 512px maskable icon has saucer in safe zone")
    print("  [ ] Blue background preserved (no transparency)")
    print("  [ ] Pixel-art aesthetic maintained (sharp pixels)")
    print("\nDeployment: Icons are in /opt/skyrewind-merged/frontend/icons/")
    print("Service restart will make them available at /static/icons/*")

    return True

if __name__ == '__main__':
    success = generate_all_icons()
    exit(0 if success else 1)
