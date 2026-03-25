import { pickSinglePdf, pickMultiplePdfs, pickImages } from '../filePicker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

jest.mock('expo-document-picker');
jest.mock('expo-image-picker');

describe('filePicker', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('pickSinglePdf', () => {
    it('returns null if canceled', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
        canceled: true,
      });

      const result = await pickSinglePdf();
      expect(result).toBeNull();
    });

    it('returns formatted file if successful', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
        canceled: false,
        assets: [
          { name: 'test.pdf', uri: 'file://test.pdf', size: 1024, mimeType: 'application/pdf' },
        ],
      });

      const result = await pickSinglePdf();
      expect(result).toEqual({
        name: 'test.pdf',
        path: 'file://test.pdf',
        size: '1.0 KB',
        mimeType: 'application/pdf',
      });
    });
  });

  describe('pickMultiplePdfs', () => {
    it('returns empty array if canceled', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
        canceled: true,
      });

      const result = await pickMultiplePdfs();
      expect(result).toEqual([]);
    });

    it('returns multiple files formatted', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
        canceled: false,
        assets: [
          { name: 'file1.pdf', uri: 'file1', size: 500, mimeType: 'application/pdf' },
          { name: 'file2.pdf', uri: 'file2', size: 2048 * 1024, mimeType: 'application/pdf' },
        ],
      });

      const result = await pickMultiplePdfs();
      expect(result).toEqual([
        { name: 'file1.pdf', path: 'file1', size: '500 B', mimeType: 'application/pdf' },
        { name: 'file2.pdf', path: 'file2', size: '2.0 MB', mimeType: 'application/pdf' },
      ]);
    });
  });

  describe('pickImages', () => {
    it('throws error if permissions not granted', async () => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'denied',
      });

      await expect(pickImages()).rejects.toThrow('Gallery permission is required to select images.');
    });

    it('returns images if successful', async () => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'granted',
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
        canceled: false,
        assets: [
          { uri: 'img1', fileName: 'img1.jpg', fileSize: 1024, type: 'image' },
        ],
      });

      const result = await pickImages();
      expect(result).toEqual([
        { name: 'img1.jpg', path: 'img1', size: '1.0 KB', mimeType: 'image/jpeg' },
      ]);
    });

    it('infers png from file name when mimeType missing', async () => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'granted',
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file://x.png', fileName: 'shot.png', fileSize: 100, type: 'image' }],
      });

      const result = await pickImages();
      expect(result[0].mimeType).toBe('image/png');
    });

    it('uses asset.mimeType when provided', async () => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'granted',
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
        canceled: false,
        assets: [
          {
            uri: 'file://x',
            fileName: 'a',
            fileSize: 100,
            type: 'image',
            mimeType: 'image/webp',
          },
        ],
      });

      const result = await pickImages();
      expect(result[0].mimeType).toBe('image/webp');
    });
  });
});
