/** Utilitas client: perkecil foto struk sebelum dikirim ke server/AI. */

export interface PreparedReceiptImage {
  /** Base64 tanpa prefix data URL. */
  base64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif';
  /** Data URL untuk pratinjau; null jika browser tidak bisa menampilkan formatnya. */
  dataUrl: string | null;
  width: number | null;
  height: number | null;
}

const SUPPORTED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

type SupportedMime = (typeof SUPPORTED_MIME)[number];

const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 4_000_000;
const MAX_DATA_URL_CHARS = 2_500_000;

function isSupportedMime(value: string): value is SupportedMime {
  return (SUPPORTED_MIME as readonly string[]).includes(value);
}

function resolveMime(file: File): SupportedMime | null {
  const type = file.type.toLowerCase();
  if (isSupportedMime(type)) return type;

  const extension = file.name.split('.').pop()?.toLowerCase();
  const byExtension: Record<string, SupportedMime> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
  };
  return extension ? (byExtension[extension] ?? null) : null;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Format gambar tidak didukung browser.'));
    image.src = src;
  });
}

function canvasToJpeg(
  source: ImageBitmap | HTMLImageElement,
  sourceWidth: number,
  sourceHeight: number,
  maxDimension: number,
  quality: number,
): { dataUrl: string; width: number; height: number } {
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Browser tidak mendukung pemrosesan gambar.');

  // Latar putih agar PNG transparan tidak menjadi hitam saat dikonversi ke JPEG.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);

  return { dataUrl: canvas.toDataURL('image/jpeg', quality), width, height };
}

/**
 * Foto kamera biasanya 3–12 MB. Kecilkan ke sisi terpanjang ±1600 px dan JPEG
 * agar hemat kuota AI serta muat di batas Server Action.
 */
export async function prepareReceiptImage(file: File): Promise<PreparedReceiptImage> {
  if (!file.size) throw new Error('File gambar kosong.');
  if (file.size > MAX_ORIGINAL_BYTES) {
    throw new Error('Foto terlalu besar (maksimal 25 MB). Pilih foto lain.');
  }

  const mime = resolveMime(file);
  if (!mime) {
    throw new Error('Format foto tidak didukung. Gunakan JPG, PNG, WebP, atau HEIC.');
  }

  let source: ImageBitmap | HTMLImageElement | null = null;
  let objectUrl: string | null = null;

  try {
    if (typeof createImageBitmap === 'function') {
      // Hormati orientasi EXIF foto kamera agar struk tidak miring.
      source = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } else {
      objectUrl = URL.createObjectURL(file);
      source = await loadImageElement(objectUrl);
    }
  } catch {
    source = null;
  }

  if (source) {
    try {
      const sourceWidth = source.width;
      const sourceHeight = source.height;

      for (const [maxDimension, quality] of [
        [1600, 0.85],
        [1280, 0.78],
        [960, 0.7],
      ] as const) {
        const result = canvasToJpeg(source, sourceWidth, sourceHeight, maxDimension, quality);
        if (result.dataUrl.length <= MAX_DATA_URL_CHARS) {
          const base64 = result.dataUrl.slice(result.dataUrl.indexOf(',') + 1);
          return {
            base64,
            mimeType: 'image/jpeg',
            dataUrl: result.dataUrl,
            width: result.width,
            height: result.height,
          };
        }
      }
      throw new Error('Gambar masih terlalu besar setelah diperkecil. Pilih foto lain.');
    } finally {
      if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) source.close();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  // Browser tidak bisa decode (umumnya HEIC di desktop): kirim file asli bila
  // ukurannya masih aman. Gemini mendukung HEIC/HEIF secara langsung.
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      'Browser tidak bisa membaca format foto ini. Pilih JPG/PNG atau kecilkan fotonya.',
    );
  }

  const dataUrl = await readAsDataUrl(file);
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  if (!base64) throw new Error('Gagal membaca file gambar.');

  return {
    base64,
    mimeType: mime,
    dataUrl: mime === 'image/heic' || mime === 'image/heif' ? null : dataUrl,
    width: null,
    height: null,
  };
}
