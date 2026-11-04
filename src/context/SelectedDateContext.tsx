import { createContext, useContext, useState, type ReactNode } from 'react';
import { todayKey } from '../domain';

type SelectedDateContextValue = {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
};

const SelectedDateContext = createContext<SelectedDateContextValue | null>(null);

export function SelectedDateProvider({ children }: { children: ReactNode }) {
  const [selectedDate, setSelectedDate] = useState(todayKey());
  return (
    <SelectedDateContext.Provider value={{ selectedDate, setSelectedDate }}>
      {children}
    </SelectedDateContext.Provider>
  );
}

export function useSelectedDate(): SelectedDateContextValue {
  const context = useContext(SelectedDateContext);
  if (!context) throw new Error('SelectedDateProvider não foi configurado.');
  return context;
}
