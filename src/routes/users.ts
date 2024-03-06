import express, { Request, Response, Router } from "express";
import { client } from "../db";
import { createUser, getUsers, updateUser } from "../controllers/users";

const router: Router = express.Router();

router.get("/users", getUsers);

router.post("/users", createUser);

router.patch("/users", updateUser);

export default router;
