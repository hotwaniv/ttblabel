"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { authFormSchema } from "@/lib/auth/credentials-schema";
import { createUser, getUserByUsername } from "@/lib/db/queries";

import { signIn } from "./auth";

export type LoginActionState = {
  status: "idle" | "in_progress" | "success" | "failed" | "invalid_data";
};

export const login = async (
  _: LoginActionState,
  formData: FormData
): Promise<LoginActionState> => {
  try {
    const validatedData = authFormSchema.parse({
      username: formData.get("username"),
      password: formData.get("password"),
    });

    await signIn("credentials", {
      username: validatedData.username,
      password: validatedData.password,
      redirect: false,
    });

    return { status: "success" };
  } catch (error) {
    if (error instanceof AuthError) {
      return { status: "failed" };
    }

    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
    }

    return { status: "failed" };
  }
};

export type RegisterActionState = {
  status:
    | "idle"
    | "in_progress"
    | "success"
    | "failed"
    | "user_exists"
    | "invalid_data";
};

export const register = async (
  _: RegisterActionState,
  formData: FormData
): Promise<RegisterActionState> => {
  try {
    const validatedData = authFormSchema.parse({
      username: formData.get("username"),
      password: formData.get("password"),
    });

    const [existingUser] = await getUserByUsername(validatedData.username);

    if (existingUser) {
      return { status: "user_exists" };
    }

    await createUser(validatedData.username, validatedData.password);
    await signIn("credentials", {
      username: validatedData.username,
      password: validatedData.password,
      redirect: false,
    });

    return { status: "success" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
    }

    return { status: "failed" };
  }
};
