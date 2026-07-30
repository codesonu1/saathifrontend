import React, { createContext, useContext, useState } from 'react';

type RegistrationData = Record<string, any>;
type DriverRegistrationContextType = {
  registrationData: RegistrationData;
  updateRegistrationData: (newData: RegistrationData) => void;
};

const DriverRegistrationContext = createContext<DriverRegistrationContextType | undefined>(undefined);

export const useDriverRegistration = () => {
  const context = useContext(DriverRegistrationContext);
  if (!context) {
    throw new Error('useDriverRegistration must be used within a DriverRegistrationProvider');
  }
  return context;
};

export const DriverRegistrationProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [registrationData, setRegistrationData] = useState<RegistrationData>({});

  const updateRegistrationData = (newData: RegistrationData) => {
    setRegistrationData((prev) => ({ ...prev, ...newData }));
  };

  return (
    <DriverRegistrationContext.Provider value={{ registrationData, updateRegistrationData }}>
      {children}
    </DriverRegistrationContext.Provider>
  );
}; 