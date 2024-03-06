import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import express, { Express } from "express";
import gameRoutes from "./routes/games";
import hydraRoutes from "./routes/hydra";
import usersRoutes from "./routes/users";

try {
  console.log("Starting server...");

  dotenv.config();

  const app: Express = express();
  const port = process.env.PORT;

  app.use(cors());
  app.use(bodyParser.json({ limit: "1mb" }));
  app.use(bodyParser.urlencoded({ extended: true, limit: "1mb" }));

  app.use(hydraRoutes);
  app.use(gameRoutes);
  app.use(usersRoutes);

  app.listen(port, () => {
    console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
  });
} catch (e) {
  if (e instanceof Error) {
    console.log(e.message.substring(0, 100));
    if (e.stack) {
      console.log(e.stack);
    }
  } else {
    console.log(e);
  }
}
