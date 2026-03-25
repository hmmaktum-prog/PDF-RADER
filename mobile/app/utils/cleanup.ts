import * as FileSystem from 'expo-file-system/legacy';

const TEMP_SUBDIRS = [
  'ocr_pages',
  'render_cache',
  'ocr_output/pages',
  '.temp',
  'intermediate',
];

/**
 * Removes temporary files used by the app, such as OCR renders and cached paths.
 * Only cleans DocumentPicker and ImagePicker cache items.
 * Output files are preserved unless explicitly deleted by the user.
 */
export async function cleanupTemporaryFiles(): Promise<void> {
  try {
    const cacheDir = FileSystem.cacheDirectory;
    if (cacheDir) {
      try {
        const contents = await FileSystem.readDirectoryAsync(cacheDir);
        for (const item of contents) {
          if (item.includes('DocumentPicker') || item.includes('ImagePicker')) {
            try {
              await FileSystem.deleteAsync(`${cacheDir}${item}`, { idempotent: true });
            } catch (itemError) {
              console.debug(`Failed to delete cache item ${item}:`, itemError);
            }
          }
        }
      } catch (cacheError) {
        console.debug('Error reading cache directory:', cacheError);
      }
    }

    const docDir = FileSystem.documentDirectory;
    if (docDir) {
      const appTempDir = `${docDir}PDFPowerTools/`;
      for (const subdir of TEMP_SUBDIRS) {
        const tempPath = `${appTempDir}${subdir}`;
        try {
          const info = await FileSystem.getInfoAsync(tempPath);
          if (info.exists && info.isDirectory) {
            await FileSystem.deleteAsync(tempPath, { idempotent: true });
          }
        } catch (dirError) {
          console.debug(`Failed to clean temp directory ${subdir}:`, dirError);
        }
      }
    }

    console.log('Temporary files cleanup completed successfully.');
  } catch (error) {
    console.warn('Error during temporary file cleanup:', error);
  }
}
