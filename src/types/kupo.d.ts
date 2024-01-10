export type Point = {
  slot_no: number;
  header_hash: string;
};

export type Value = {
  coins: number;
  assets: {
    [policyId: string]: number;
  };
};

export type TransactionOutput = {
  transaction_index: number;
  transaction_id: string;
  output_index: number;
  address: string;
  value: Value;
  datum_hash: string | null;
  datum_type?: "hash" | "inline";
  script_hash: string | null;
  created_at: Point;
  spent_at: Point | null;
};
