"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.txBuilderConfig = exports.parameters = exports.toUnitInterval = exports.toValue = exports.resetAddress = void 0;
const CSL = __importStar(require("@emurgo/cardano-serialization-lib-nodejs"));
function resetAddress(cardanoProvider, cardanoWallet) {
    return __awaiter(this, void 0, void 0, function* () {
        const nativeScript = CSL.NativeScript.new_script_pubkey(CSL.ScriptPubkey.new(CSL.Ed25519KeyHash.from_hex("b5b425aa8b18c537da26366fe4da1c709440daa7878ac25c63d89086")));
        const utxos = yield cardanoProvider.fetchAddressUTxOs("addr_test1wz0c73j3czfd77gtg58jtm2dz8fz7yrxzylv7dc67kew5tqk4uqc9");
        const txBuilder = CSL.TransactionBuilder.new(exports.txBuilderConfig);
        for (const utxo of utxos) {
            const txInput = CSL.TransactionInput.new(CSL.TransactionHash.from_hex(utxo.input.txHash), utxo.input.outputIndex);
            txBuilder.add_native_script_input(nativeScript, txInput, (0, exports.toValue)(utxo.output.amount));
        }
        txBuilder.add_change_if_needed(CSL.Address.from_bech32("addr_test1qp0e5qe6qgcy3vq0edsn962hz5cdnj9cecv8l3ajz89z6up092f5h9tjd7zgaj054jqa337mtue6mrmkfd93n48dqdvsj8las4"));
        txBuilder.add_required_signer(CSL.Ed25519KeyHash.from_hex("b5b425aa8b18c537da26366fe4da1c709440daa7878ac25c63d89086"));
        const tx = txBuilder.build_tx();
        console.log("Tx", tx.to_json());
        const txUnsigned = tx.to_hex();
        const txSigned = yield cardanoWallet.signTx(txUnsigned, true);
        const txHash = yield cardanoWallet.submitTx(txSigned);
        console.log("Funds recoleted", txHash);
    });
}
exports.resetAddress = resetAddress;
const toValue = (assets) => {
    const lovelace = assets.find((asset) => asset.unit === "lovelace");
    const policies = Array.from(new Set(assets
        .filter((asset) => asset.unit !== "lovelace")
        .map((asset) => asset.unit.slice(0, 56))));
    const multiAsset = CSL.MultiAsset.new();
    policies.forEach((policyId) => {
        const policyAssets = CSL.Assets.new();
        assets
            .filter((asset) => asset.unit.slice(0, 56) === policyId)
            .forEach((asset) => {
            policyAssets.insert(CSL.AssetName.new(Buffer.from(asset.unit.slice(56), "hex")), CSL.BigNum.from_str(asset.quantity));
        });
        multiAsset.insert(CSL.ScriptHash.from_hex(policyId), policyAssets);
    });
    const value = CSL.Value.new(CSL.BigNum.from_str(lovelace ? lovelace.quantity : "0"));
    if (assets.length > 1 || !lovelace) {
        value.set_multiasset(multiAsset);
    }
    return value;
};
exports.toValue = toValue;
const toUnitInterval = (float) => {
    var _a;
    const decimal = (_a = float.split(".")[1]) !== null && _a !== void 0 ? _a : "0";
    const numerator = `${parseInt(decimal, 10)}`;
    const denominator = "1" + "0".repeat(decimal.length);
    return CSL.UnitInterval.new(CSL.BigNum.from_str(numerator), CSL.BigNum.from_str(denominator));
};
exports.toUnitInterval = toUnitInterval;
exports.parameters = {
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
exports.txBuilderConfig = CSL.TransactionBuilderConfigBuilder.new()
    .coins_per_utxo_byte(CSL.BigNum.from_str(exports.parameters.coinsPerUTxOSize))
    .ex_unit_prices(CSL.ExUnitPrices.new((0, exports.toUnitInterval)(exports.parameters.priceMem.toString()), (0, exports.toUnitInterval)(exports.parameters.priceStep.toString())))
    .fee_algo(CSL.LinearFee.new(CSL.BigNum.from_str(exports.parameters.minFeeA.toString()), CSL.BigNum.from_str(exports.parameters.minFeeB.toString())))
    .key_deposit(CSL.BigNum.from_str(exports.parameters.keyDeposit))
    .max_tx_size(exports.parameters.maxTxSize)
    .max_value_size(parseInt(exports.parameters.maxValSize, 10))
    .pool_deposit(CSL.BigNum.from_str(exports.parameters.poolDeposit))
    .build();
//# sourceMappingURL=cardano.js.map