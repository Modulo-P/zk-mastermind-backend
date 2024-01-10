export type BridgeOperation = {
  id: number;
  origin: "Cardano" | "Hydra";
  originAddress: string;
  originTxHash: string;
  originOutputIndex: number;
  amount: {
    unit: string;
    quantity: string;
  }[];
  destination: "Cardano" | "Hydra";
  destinationAddress: string;
  destinationTxHash: string;
  destinationOutputIndex: number;
  state: "Pending" | "Submitting" | "Submitted" | "Confirmed" | "Failed";
};
