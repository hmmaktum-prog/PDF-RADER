/**
 * filePicker.ts
 * Real file picker utilities using expo-document-picker and expo-image-picker.
 * Replaces all mock file selection across the app.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

export interface PickedFile {
  name: string;
  path: string;
  size?: string;
  mimeType?: string;
}

/**
 * Pick a single PDF file from device storage.
 * Returns null if user cancels.
 */
export async function pickSinglePdf(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: false,
    multiple: false,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  return {
    name: asset.name,
    path: asset.uri,
    size: asset.size ? formatBytes(asset.size) : undefined,
    mimeType: asset.mimeType ?? 'application/pdf',
  };
}

/**
 * Pick multiple PDF files from device storage.
 * Returns empty array if user cancels.
 */
export async function pickMultiplePdfs(): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: false,
    multiple: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return [];
  }

  return result.assets.map((asset) => ({
    name: asset.name,
    path: asset.uri,
    size: asset.size ? formatBytes(asset.size) : undefined,
    mimeType: asset.mimeType ?? 'application/pdf',
  }));
}

/**
 * Pick multiple images from gallery (for Image → PDF tool).
 * Returns empty array if user cancels.
 */
export async function pickImages(): Promise<PickedFile[]> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Gallery permission is required to select images.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    quality: 1,
    selectionLimit: 30,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return [];
  }

  return result.assets.map((asset, index) => ({
    name: asset.fileName ?? `image_${index + 1}.jpg`,
    path: asset.uri,
    size: asset.fileSize ? formatBytes(asset.fileSize) : undefined,
    mimeType: inferImageMimeType(asset),
  }));
}

/** Prefer expo-image-picker mimeType; fall back to filename / URI. */
function inferImageMimeType(asset: ImagePicker.ImagePickerAsset): string {
  const fromPicker = asset.mimeType?.trim();
  if (fromPicker) return fromPicker;
  const name = (asset.fileName ?? asset.uri ?? '').toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.heic') || name.endsWith('.heif')) return 'image/heic';
  if (name.endsWith('.bmp')) return 'image/bmp';
  return 'image/jpeg';
}

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
