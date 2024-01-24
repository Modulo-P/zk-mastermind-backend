import express, { Request, Response, Router } from "express";
import { HydraEngine } from "../hydra/engine";
import { HydraProvider } from "../hydra/provider";
import { KupoMatchesPub } from "../kupo";
import { BridgeEngine } from "../bridge/engine";

const router: Router = express.Router();

const hydraManager = HydraEngine.getInstance();
const hydraProvider = new HydraProvider(hydraManager);

const matchesPub = new KupoMatchesPub(process.env.KUPO_URL!);
matchesPub.start();

const bridgeEngine = new BridgeEngine(matchesPub, hydraProvider);

router.get("/hydra/utxos", async (req: Request, res: Response) => {
  if (req.query.address) {
    return res.send(
      hydraManager.utxos.filter(
        (utxo) => utxo.output.address === req.query.address
      )
    );
  } else if (req.query.txHash) {
    return res.send(await hydraProvider.fetchUTxOs(req.query.txHash as string));
  } else {
    return res.send(hydraManager.utxos);
  }
});

router.post("/hydra/submitTx", async (req: Request, res: Response) => {
  console.log("submitTx", req.body.tx);

  try {
    const tx = await hydraManager.submitTx(req.body.tx);
    res.send(tx);
  } catch (e) {
    res.status(500).send(e);
  }
});

export default router;
