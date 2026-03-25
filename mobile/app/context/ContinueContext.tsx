import React, { createContext, useContext, useState } from 'react';
import type { PickedFile } from '../utils/filePicker';

interface ContinueContextProps {
  sharedFilePath: string | null;
  setSharedFilePath: (path: string | null) => void;
  /** Files chosen on the home screen, consumed once by a tool (e.g. Merge, Image→PDF). */
  queuedPickedFiles: PickedFile[] | null;
  setQueuedPickedFiles: (files: PickedFile[] | null) => void;
  clearState: () => void;
}

const ContinueContext = createContext<ContinueContextProps>({
  sharedFilePath: null,
  setSharedFilePath: () => {},
  queuedPickedFiles: null,
  setQueuedPickedFiles: () => {},
  clearState: () => {},
});

export const ContinueProvider = ({ children }: { children: React.ReactNode }) => {
  const [sharedFilePath, setSharedFilePath] = useState<string | null>(null);
  const [queuedPickedFiles, setQueuedPickedFiles] = useState<PickedFile[] | null>(null);

  const clearState = () => {
    setSharedFilePath(null);
    setQueuedPickedFiles(null);
  };

  return (
    <ContinueContext.Provider
      value={{ sharedFilePath, setSharedFilePath, queuedPickedFiles, setQueuedPickedFiles, clearState }}
    >
      {children}
    </ContinueContext.Provider>
  );
};

export const useContinueTool = () => useContext(ContinueContext);
