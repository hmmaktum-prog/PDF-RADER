import * as FileSystem from 'expo-file-system/legacy';

export function getOutputPath(filename: string): string {
  const base = FileSystem.documentDirectory ?? 'file:///';
  const dotIdx = filename.lastIndexOf('.');
  const name = dotIdx !== -1 ? filename.substring(0, dotIdx) : filename;
  const ext = dotIdx !== -1 ? filename.substring(dotIdx) : '';
  const timestamp = new Date().getTime();
  return `${base}PDFPowerTools/${name}_${timestamp}${ext}`;
}

export async function ensureOutputDir(): Promise<void> {
  const dir = (FileSystem.documentDirectory ?? 'file:///') + 'PDFPowerTools/';
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}
