import { useEffect } from 'react';
import { useContinueTool } from '../context/ContinueContext';

/**
 * Hook to automatically consume a file either from common continue-state 
 * (sharedFilePath) or from the home-screen queue (queuedPickedFiles).
 */
export function usePreselectedFile(
  setSelectedFile: (path: string) => void,
  setSelectedFileName: (name: string) => void
) {
  const { queuedPickedFiles, sharedFilePath, setQueuedPickedFiles } = useContinueTool();

  useEffect(() => {
    if (sharedFilePath) {
      setSelectedFile(sharedFilePath);
      setSelectedFileName(sharedFilePath.split('/').pop() || 'document.pdf');
    } else if (queuedPickedFiles && queuedPickedFiles.length > 0) {
      const first = queuedPickedFiles[0];
      setSelectedFile(first.path);
      setSelectedFileName(first.name);
      setQueuedPickedFiles(null);
    }
  }, []);
}
