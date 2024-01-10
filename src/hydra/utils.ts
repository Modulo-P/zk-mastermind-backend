import { UTxO } from "@meshsdk/core";
import { HydraUTxO } from "../types/hydra";

export async function convertHydraToMeshUTxOs(utxo: HydraUTxO) {
  const keys = Object.getOwnPropertyNames(utxo);
  const result: UTxO[] = [];
  for (const key of keys) {
    const value = utxo[key];

    result.push({
      input: {
        txHash: key.split("#")[0],
        outputIndex: Number(key.split("#")[1]),
      },
      output: {
        address: value.address!,
        dataHash: value.datumhash === null ? undefined : value.datumhash,
        plutusData: value.inlineDatum ?? undefined,
        scriptRef:
          value.referenceScript === null ? undefined : value.referenceScript,
        amount: Object.getOwnPropertyNames(value.value).flatMap((k) => {
          if (k === "lovelace") {
            return {
              unit: k,
              quantity: value.value[k].toString(),
            };
          } else {
            return Object.getOwnPropertyNames(value.value[k]).map((kk) => {
              return {
                unit: k + kk,
                quantity: (value.value[k] as any)[kk].toString(),
              };
            });
          }
        }),
      },
    });
  }
  return result;
}
