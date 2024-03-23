import { HydraConnection } from "./hydra/client/connection/hydra-connection";
import dotenv from "dotenv";

dotenv.config();

const conn = new HydraConnection(
  `ws://${process.env.HYDRA_NODE_1_HOST}/?history=no&tx-output=cbor`
);

conn.connect();

async function notKill() {
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

notKill();
