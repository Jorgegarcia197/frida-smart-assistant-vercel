'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';
import type { DataUIPart } from 'ai';
import type { CustomUIDataTypes } from '@/lib/types';

interface DataStreamContextValue {
  dataStream: DataUIPart<CustomUIDataTypes>[];
  setDataStream: React.Dispatch<
    React.SetStateAction<DataUIPart<CustomUIDataTypes>[]>
  >;
}

const DataStreamContext = createContext<DataStreamContextValue | null>(null);
const NOOP_SET_DATA_STREAM: React.Dispatch<
  React.SetStateAction<DataUIPart<CustomUIDataTypes>[]>
> = () => {};
const FALLBACK_DATA_STREAM_CONTEXT: DataStreamContextValue = {
  dataStream: [],
  setDataStream: NOOP_SET_DATA_STREAM,
};

export function DataStreamProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [dataStream, setDataStream] = useState<DataUIPart<CustomUIDataTypes>[]>(
    [],
  );

  const value = useMemo(() => ({ dataStream, setDataStream }), [dataStream]);

  return (
    <DataStreamContext.Provider value={value}>
      {children}
    </DataStreamContext.Provider>
  );
}

export function useDataStream() {
  const context = useContext(DataStreamContext);
  if (!context) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        'useDataStream called outside DataStreamProvider; using noop fallback.',
      );
    }
    return FALLBACK_DATA_STREAM_CONTEXT;
  }
  return context;
}
