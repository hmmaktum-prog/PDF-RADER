import * as FileSystem from 'expo-file-system/legacy';

export function getOutputPath(filename: string): string {
  const base = FileSystem.documentDirectory ?? 'file:///';
  return base + 'PDFPowerTools/' + filename;
}

export async function ensureOutputDir(): Promise<void> {
  const dir = (FileSystem.documentDirectory ?? 'file:///') + 'PDFPowerTools/';
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}
