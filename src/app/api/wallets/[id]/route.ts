import { NextRequest, NextResponse } from "next/server";
import Wallet from "@/models/Wallet";
import { ObjectId } from "mongodb";
import { z } from "zod";
import errorHandler from "@/helpers/handleError";
import CustomError from "@/helpers/CustomError";

// Validation schema for updating wallet
const updateWalletSchema = z.object({
  name: z
    .string()
    .nonempty("Name is required")
    .min(2, "Name must be at least 2 characters long")
    .max(50, "Name must not exceed 50 characters")
    .optional(),
  description: z.string().optional(),
  type: z
    .string()
    .nonempty("Type is required")
    .min(2, "Type must be at least 2 characters long")
    .max(30, "Type must not exceed 30 characters")
    .optional(),
  target: z.number().optional(),
  threshold: z.number().optional(),
});

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

// GET /api/wallets/[id] - Get wallet by ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get user_id from middleware header
    const user_id = request.headers.get("x-user-id");
    if (!user_id || !ObjectId.isValid(user_id)) {
      throw new CustomError("Invalid user ID", 400);
    }

    if (!ObjectId.isValid(id)) {
      throw new CustomError("Invalid wallet ID", 400);
    }

    const wallet = await Wallet.where("_id", new ObjectId(id))
      .where("user_id", new ObjectId(user_id))
      .first();

    if (!wallet) {
      throw new CustomError("Wallet not found", 404);
    }

    // Check if wallet belongs to the authenticated user
    if (wallet.user_id.toString() !== user_id) {
      throw new CustomError("Unauthorized access to wallet", 403);
    }

    return NextResponse.json(wallet);
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}

// PUT /api/wallets/[id] - Update wallet by ID
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Get user_id from middleware header
    const user_id = request.headers.get("x-user-id");
    if (!user_id || !ObjectId.isValid(user_id)) {
      throw new CustomError("Invalid user ID", 400);
    }

    if (!ObjectId.isValid(id)) {
      throw new CustomError("Invalid wallet ID", 400);
    }

    // Validate input data
    const validatedData = updateWalletSchema.parse(body);

    const checkWallet = await Wallet.where("_id", new ObjectId(id))
      .where("user_id", new ObjectId(user_id))
      .first();

    if (!checkWallet) {
      throw new CustomError("Wallet not found", 404);
    }

    // Check if wallet belongs to the authenticated user
    if (checkWallet.user_id.toString() !== user_id) {
      throw new CustomError("Unauthorized access to wallet", 403);
    }

    // Update wallet properties with validated data
    await Wallet.where("_id", new ObjectId(id))
      .where("user_id", new ObjectId(user_id))
      .update(validatedData);

    return NextResponse.json({
      message: "Wallet updated successfully",
    });
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}

// DELETE /api/wallets/[id] - Delete wallet by ID
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get user_id from middleware header
    const user_id = request.headers.get("x-user-id");
    if (!user_id || !ObjectId.isValid(user_id)) {
      throw new CustomError("Invalid user ID", 400);
    }

    if (!ObjectId.isValid(id)) {
      throw new CustomError("Invalid wallet ID", 400);
    }

    const wallet = await Wallet.find(id);
    if (!wallet) {
      throw new CustomError("Wallet not found", 404);
    }

    // Check if wallet belongs to the authenticated user
    if (wallet.user_id.toString() !== user_id) {
      throw new CustomError("Unauthorized access to wallet", 403);
    }

    await wallet.delete();

    return NextResponse.json({
      message: "Wallet deleted successfully",
    });
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}
