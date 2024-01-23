import {
  AccountInfo,
  Asset,
  AssetMetadata,
  BlockInfo,
  IFetcher,
  IListener,
  ISubmitter,
  Protocol,
  TransactionInfo,
  UTxO,
} from "@meshsdk/core";
import { HydraEngine } from "./engine";

export class HydraProvider implements IFetcher, ISubmitter, IListener {
  private _manager: HydraEngine;

  constructor(manager: HydraEngine) {
    this._manager = manager;
  }
  onTxConfirmed(txHash: string, callback: () => void, limit = 100): void {
    let attempts = 0;

    const checkTx = setInterval(() => {
      if (attempts >= limit) clearInterval(checkTx);

      this.fetchTxInfo(txHash)
        .then((txInfo) => {
          this.fetchBlockInfo(txInfo.block)
            .then((blockInfo) => {
              if (blockInfo?.confirmations > 0) {
                clearInterval(checkTx);
                callback();
              }
            })
            .catch(() => {
              attempts += 1;
            });
        })
        .catch(() => {
          attempts += 1;
        });
    }, 1_000);
  }

  fetchAccountInfo(address: string): Promise<AccountInfo> {
    throw new Error("Method not implemented.");
  }

  async fetchAddressUTxOs(
    address: string,
    asset?: string | undefined
  ): Promise<UTxO[]> {
    let utxos: UTxO[] = [];

    await this._manager.fetchUTxOs();

    for (const utxo of this._manager.utxos) {
      if (utxo.output.address === address) {
        if (asset && utxo.output.amount.some((a) => a.unit.startsWith(asset))) {
          utxos.push(utxo);
        } else if (!asset) {
          utxos.push(utxo);
        }
      }
    }

    return utxos;
  }

  fetchAssetAddresses(
    asset: string
  ): Promise<{ address: string; quantity: string }[]> {
    throw new Error("Method not implemented.");
  }

  fetchAssetMetadata(asset: string): Promise<AssetMetadata> {
    throw new Error("Method not implemented.");
  }

  fetchBlockInfo(hash: string): Promise<BlockInfo> {
    throw new Error("Method not implemented.");
  }

  fetchCollectionAssets(
    policyId: string,
    cursor?: string | number | undefined
  ): Promise<{ assets: Asset[]; next: string | number | null }> {
    throw new Error("Method not implemented.");
  }

  fetchHandleAddress(handle: string): Promise<string> {
    throw new Error("Method not implemented.");
  }

  fetchProtocolParameters(epoch: number): Promise<Protocol> {
    throw new Error("Method not implemented.");
  }

  fetchTxInfo(hash: string): Promise<TransactionInfo> {
    throw new Error("Method not implemented.");
  }

  async fetchUTxOs(hash: string): Promise<UTxO[]> {
    await this._manager.fetchUTxOs();
    return this._manager.utxos.filter((utxo) => utxo.input.txHash === hash);
  }

  submitTx(tx: string): Promise<string> {
    return this._manager.submitTx(tx);
  }
}
