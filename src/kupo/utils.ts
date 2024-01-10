import { Asset } from "@meshsdk/core";
import { TransactionOutput } from "../types/kupo";

export function MatchesToUTxOs(
  matches: TransactionOutput[],
  datums: Map<string, string>
) {
  return Promise.all(
    matches.map(async (match) => {
      const assets: Asset[] = [];
      assets.push({
        unit: "lovelace",
        quantity: match.value.coins.toString(),
      });

      for (const asset in match.value.assets) {
        assets.push({
          unit: asset,
          quantity: match.value.assets[asset].toString(),
        });
      }

      let plutusData: undefined | string = undefined;

      if (match.datum_type === "inline" && match.datum_hash) {
        plutusData = datums.get(match.datum_hash);

        if (!plutusData) {
          const datumResponse = await fetch(
            "http://192.168.64.4:1442/datums/" + match.datum_hash
          );
          plutusData = (await datumResponse.json()).datum as string;
          datums.set(match.datum_hash, plutusData);
        }
      }

      return {
        input: {
          txHash: match.transaction_id,
          outputIndex: match.output_index,
        },
        output: {
          address: match.address,
          amount: assets,
          dataHash: match.datum_hash ?? undefined,
          plutusData: plutusData ?? undefined,
        },
      };
    })
  );
}
