import express, { Request, Response, Router } from "express";
import { HydraEngine } from "../hydra/engine";
import { HydraProvider } from "../hydra/provider";
import { BridgeEngine } from "../bridge/engine";
import { KupoClient } from "../kupo";
import { BlockfrostProvider } from "@meshsdk/core";

const router: Router = express.Router();

const hydraEngine = HydraEngine.getInstance();
const hydraProvider = new HydraProvider(hydraEngine);
const kupoClient = new KupoClient(process.env.KUPO_URL!);
const hydraCardano = new BlockfrostProvider(process.env.BLOCKFROST_PROJECT_ID!);

const bridgeEngine = new BridgeEngine(kupoClient, hydraEngine, hydraCardano);

router.get("/hydra/utxos", async (req: Request, res: Response) => {
  if (req.query.address) {
    return res.send(
      hydraEngine.utxos.filter(
        (utxo) => utxo.output.address === req.query.address
      )
    );
  } else if (req.query.txHash) {
    return res.send(await hydraProvider.fetchUTxOs(req.query.txHash as string));
  } else {
    return res.send(hydraEngine.utxos);
  }
});

router.post("/hydra/submitTx", async (req: Request, res: Response) => {
  console.log("submitTx", req.body.tx);

  try {
    const tx = await hydraEngine.submitTx(req.body.tx);
    res.send(tx);
  } catch (e) {
    res.status(500).send(e);
  }
});

export default router;
