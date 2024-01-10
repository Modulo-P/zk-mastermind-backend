import * as CSL from "@emurgo/cardano-serialization-lib-nodejs";
import { Asset } from "@meshsdk/core";
import dotenv from "dotenv";
import express, { Express, Request, Response } from "express";
import { KupoMatchesPub } from "./kupo";
import { HydraEngine } from "./hydra/engine";
import { BridgeEngine } from "./bridge/engine";
import { HydraProvider } from "./hydra/provider";
import cors from "cors";
import hydraRoutes from "./routes/hydra";
import gameRoutes from "./routes/games";
import bodyParser from "body-parser";

dotenv.config();

const app: Express = express();
const port = process.env.PORT;

app.use(cors());
app.use(bodyParser.json());

app.use(hydraRoutes);
app.use(gameRoutes);

app.listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
