import * as CSL from "@emurgo/cardano-serialization-lib-nodejs";
import { AppWallet, Asset, IFetcher, Protocol } from "@meshsdk/core";

export async function resetAddress(
  cardanoProvider: IFetcher,
  cardanoWallet: AppWallet
) {
  const nativeScript = CSL.NativeScript.new_script_pubkey(
    CSL.ScriptPubkey.new(
      CSL.Ed25519KeyHash.from_hex(
        "b5b425aa8b18c537da26366fe4da1c709440daa7878ac25c63d89086"
      )
    )
  );

  const utxos = await cardanoProvider.fetchAddressUTxOs(
    "addr_test1wz0c73j3czfd77gtg58jtm2dz8fz7yrxzylv7dc67kew5tqk4uqc9"
  );

  const txBuilder = CSL.TransactionBuilder.new(txBuilderConfig);

  for (const utxo of utxos) {
    const txInput = CSL.TransactionInput.new(
      CSL.TransactionHash.from_hex(utxo.input.txHash),
      utxo.input.outputIndex
    );
    txBuilder.add_native_script_input(
      nativeScript,
      txInput,
      toValue(utxo.output.amount)
    );
  }

  txBuilder.add_change_if_needed(
    CSL.Address.from_bech32(
      "addr_test1qp0e5qe6qgcy3vq0edsn962hz5cdnj9cecv8l3ajz89z6up092f5h9tjd7zgaj054jqa337mtue6mrmkfd93n48dqdvsj8las4"
    )
  );

  txBuilder.add_required_signer(
    CSL.Ed25519KeyHash.from_hex(
      "b5b425aa8b18c537da26366fe4da1c709440daa7878ac25c63d89086"
    )
  );

  const tx = txBuilder.build_tx();

  console.log("Tx", tx.to_json());

  const txUnsigned = tx.to_hex();
  const txSigned = await cardanoWallet.signTx(txUnsigned, true);
  const txHash = await cardanoWallet.submitTx(txSigned);
  console.log("Funds recoleted", txHash);
}

export const toValue = (assets: Asset[]) => {
  const lovelace = assets.find((asset) => asset.unit === "lovelace");
  const policies = Array.from(
    new Set<string>(
      assets
        .filter((asset) => asset.unit !== "lovelace")
        .map((asset) => asset.unit.slice(0, 56))
    )
  );

  const multiAsset = CSL.MultiAsset.new();
  policies.forEach((policyId) => {
    const policyAssets = CSL.Assets.new();
    assets
      .filter((asset) => asset.unit.slice(0, 56) === policyId)
      .forEach((asset) => {
        policyAssets.insert(
          CSL.AssetName.new(Buffer.from(asset.unit.slice(56), "hex")),
          CSL.BigNum.from_str(asset.quantity)
        );
      });

    multiAsset.insert(CSL.ScriptHash.from_hex(policyId), policyAssets);
  });

  const value = CSL.Value.new(
    CSL.BigNum.from_str(lovelace ? lovelace.quantity : "0")
  );

  if (assets.length > 1 || !lovelace) {
    value.set_multiasset(multiAsset);
  }

  return value;
};

export const toUnitInterval = (float: string) => {
  const decimal = float.split(".")[1] ?? "0";

  const numerator = `${parseInt(decimal, 10)}`;
  const denominator = "1" + "0".repeat(decimal.length);

  return CSL.UnitInterval.new(
    CSL.BigNum.from_str(numerator),
    CSL.BigNum.from_str(denominator)
  );
};

export const parameters: Protocol = {
  epoch: 0,
  coinsPerUTxOSize: "4310",
  priceMem: 0.0577,
  priceStep: 0.0000721,
  minFeeA: 44,
  minFeeB: 157381,
  keyDeposit: "2000000",
  maxTxSize: 16384,
  maxValSize: "5000",
  poolDeposit: "500000000",
  maxCollateralInputs: 3,
  decentralisation: 0,
  maxBlockSize: 98304,
  collateralPercent: 150,
  maxBlockHeaderSize: 1100,
  minPoolCost: "340000000",
  maxTxExMem: "16000000",
  maxTxExSteps: "10000000000",
  maxBlockExMem: "80000000",
  maxBlockExSteps: "40000000000",
};

export const txBuilderConfig = CSL.TransactionBuilderConfigBuilder.new()
  .coins_per_utxo_byte(CSL.BigNum.from_str(parameters.coinsPerUTxOSize))
  .ex_unit_prices(
    CSL.ExUnitPrices.new(
      toUnitInterval(parameters.priceMem.toString()),
      toUnitInterval(parameters.priceStep.toString())
    )
  )
  .fee_algo(
    CSL.LinearFee.new(
      CSL.BigNum.from_str(parameters.minFeeA.toString()),
      CSL.BigNum.from_str(parameters.minFeeB.toString())
    )
  )
  .key_deposit(CSL.BigNum.from_str(parameters.keyDeposit))
  .max_tx_size(parameters.maxTxSize)
  .max_value_size(parseInt(parameters.maxValSize, 10))
  .pool_deposit(CSL.BigNum.from_str(parameters.poolDeposit))
  .build();
