"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const engine_1 = require("../hydra/engine");
const provider_1 = require("../hydra/provider");
const kupo_1 = require("../kupo");
const engine_2 = require("../bridge/engine");
const router = express_1.default.Router();
const hydraManager = engine_1.HydraEngine.getInstance();
const hydraProvider = new provider_1.HydraProvider(hydraManager);
const matchesPub = new kupo_1.KupoMatchesPub("http://192.168.64.4:1442");
matchesPub.start();
const bridgeEngine = new engine_2.BridgeEngine(matchesPub, hydraProvider);
router.get("/hydra/utxos", (req, res) => {
    if (req.query.address) {
        return res.send(hydraManager.utxos.filter((utxo) => utxo.output.address === req.query.address));
    }
    else if (req.query.txHash) {
        return res.send(hydraManager.utxos.filter((utxo) => utxo.input.txHash === req.query.txHash));
    }
    else {
        return res.send(hydraManager.utxos);
    }
});
router.post("/hydra/submitTx", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("submitTx", req.body.tx);
    try {
        const tx = yield hydraManager.submitTx(req.body.tx);
        res.send(tx);
    }
    catch (e) {
        res.status(500).send(e);
    }
}));
exports.default = router;
//# sourceMappingURL=hydra.js.map