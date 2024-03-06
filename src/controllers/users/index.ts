import express, { Request, Response, Router } from "express";
import { client } from "../../db";

export async function getUsers(req: Request, res: Response) {
  if (req.query.address) {
    const user = await client.user.findUnique({
      where: {
        address: req.query.address as string,
      },
    });

    if (user) {
      return res.send({ data: user });
    } else {
      return res.send({ data: null });
    }
  }
  return res.send({ message: "User not found" });
}

export async function createUser(req: Request, res: Response) {
  const data = req.body;

  const user = await client.user.findUnique({
    where: {
      address: data.address,
    },
  });

  if (user) {
    return res.status(400).json({ message: "User already exists" });
  }

  try {
    const newUser = await client.user.create({
      data: {
        address: data.address,
        nickname: data.nickname,
      },
    });

    return res.status(200).json({ message: "User created", data: newUser });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateUser(req: Request, res: Response) {
  const data = req.body;

  const user = await client.user.findUnique({
    where: {
      id: data.id,
    },
  });

  if (!user) {
    return res.status(400).json({ message: "User not found" });
  }

  try {
    const updatedUser = await client.user.update({
      where: {
        id: data.id,
      },
      data: {
        nickname: data.nickname,
      },
    });

    return res.status(200).json({ message: "User updated", data: updatedUser });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
