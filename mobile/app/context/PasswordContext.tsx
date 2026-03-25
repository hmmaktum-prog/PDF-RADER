import React, { createContext, useContext, useState } from 'react';

// Short-lived in-memory password store to avoid repeated prompts dynamically processing encrypted PDFs.
interface PasswordContextProps {
  currentPassword: string | null;
  setPassword: (password: string | null) => void;
}

const PasswordContext = createContext<PasswordContextProps>({
  currentPassword: null,
  setPassword: () => {},
});

export const PasswordProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentPassword, setPassword] = useState<string | null>(null);

  return (
    <PasswordContext.Provider value={{ currentPassword, setPassword }}>
      {children}
    </PasswordContext.Provider>
  );
};

export const usePassword = () => useContext(PasswordContext);
