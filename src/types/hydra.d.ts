export type HydraWebsocketPromise = {
  command: { tag: string };
  id?: string;
  [key: string]: any;
  resolve: (result?: any) => void;
  reject: (reason?: any) => void;
};

export type HydraUTxO = {
  [utxo: string]: {
    address?: string;
    datum?: string | null;
    datumhash?: string | null;
    inlineDatum?: string | null;
    referenceScript?: string | null;
    value: {
      [unit: string]: number | { [assetId: string]: number };
    };
  };
};
