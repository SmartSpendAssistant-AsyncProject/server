import { NextRequest, NextResponse } from "next/server";
import Wallet from "@/models/Wallet";
import { z } from "zod";
import errorHandler from "@/helpers/handleError";
import { ObjectId } from "mongodb";

// Validation schema
const walletSchema = z.object({
  name: z
    .string()
    .nonempty("Name is required")
    .min(2, "Name must be at least 2 characters long")
    .max(50, "Name must not exceed 50 characters"),
  description: z.string().optional().default(""),
  type: z
    .string()
    .nonempty("Type is required")
    .min(2, "Type must be at least 2 characters long")
    .max(30, "Type must not exceed 30 characters"),
  balance: z.number().optional().default(0),
  target: z.number().optional().default(0),
  threshold: z.number().optional().default(0),
  user_id: z.string().nonempty("User ID is required"),
});

// POST /api/wallets - Create new wallet
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input data
    const validatedData = walletSchema.parse(body);

    const walletData = {
      name: validatedData.name,
      description: validatedData.description,
      type: validatedData.type,
      balance: validatedData.balance,
      target: validatedData.target,
      threshold: validatedData.threshold,
      user_id: new ObjectId(validatedData.user_id),
    };

    const savedWallet = await Wallet.create(walletData);

    return NextResponse.json(
      {
        message: "Wallet created successfully",
        data: savedWallet,
      },
      { status: 201 }
    );
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}
