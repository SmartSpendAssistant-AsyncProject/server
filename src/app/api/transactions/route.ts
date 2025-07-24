import { NextRequest, NextResponse } from "next/server";
import Transaction from "@/models/Transaction";
import Wallet from "@/models/Wallet";
import { z } from "zod";
import errorHandler from "@/helpers/handleError";
import { ObjectId } from "mongodb";
import Category from "@/models/Category";
import CustomError from "@/helpers/CustomError";
import { DB } from "mongoloquent";

// Validation schema
const transactionSchema = z.object({
  name: z
    .string()
    .nonempty("Name is required")
    .min(2, "Name must be at least 2 characters long")
    .max(100, "Name must not exceed 100 characters"),
  description: z.string().optional().default(""),
  ammount: z.number().positive("Amount must be a positive number"),
  date: z
    .string()
    .nonempty("Date is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  category_id: z.string().nonempty("Category ID is required"),
  wallet_id: z.string().nonempty("Wallet ID is required"),
  parent_id: z.string().optional(),
  remaining_ammount: z.number().optional(),
  message_id: z.string().optional(),
});

// POST /api/transactions - Create new transaction
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Get user_id from middleware header
    const user_id = request.headers.get("x-user-id");
    if (!user_id || !ObjectId.isValid(user_id))
      throw new CustomError("Invalid user ID", 400);

    // Validate input data
    const validatedData = transactionSchema.parse(body);

    // Validate ObjectId format for category_id and wallet_id
    if (!ObjectId.isValid(validatedData.category_id))
      throw new CustomError("Invalid category ID format", 400);

    if (!ObjectId.isValid(validatedData.wallet_id))
      throw new CustomError("Invalid wallet ID format", 400);

    // Check if wallet belongs to user
    const wallet = await Wallet.where("_id", validatedData.wallet_id).first();
    if (!wallet) throw new CustomError("Wallet not found", 404);

    if (wallet.user_id.toString() !== user_id)
      throw new CustomError("Unauthorized access to wallet", 403);

    // Check if category belongs to user
    const category = await Category.where(
      "_id",
      validatedData.category_id
    ).first();
    if (!category) throw new CustomError("Category not found", 404);

    if (category.user_id.toString() !== user_id)
      throw new CustomError("Unauthorized access to category", 403);

    // Create transaction in a transaction block
    // This ensures that if any part fails, the entire operation is rolled back
    await DB.transaction(async (session) => {
      // Create Date object for better date handling and filtering
      const transactionDate = new Date(
        `${validatedData.date}T${new Date().toISOString().slice(11)}`
      );

      const transactionData = {
        name: validatedData.name,
        description: validatedData.description,
        ammount: validatedData.ammount,
        date: transactionDate, // Store as Date object for better $gte/$lte filtering
        category_id: new ObjectId(validatedData.category_id),
        wallet_id: new ObjectId(validatedData.wallet_id),
        parent_id: validatedData.parent_id
          ? new ObjectId(validatedData.parent_id)
          : undefined,
        remaining_ammount: validatedData.remaining_ammount || 0,
        message_id: validatedData.message_id
          ? new ObjectId(validatedData.message_id)
          : undefined,
      };

      // Create transaction
      await Transaction.create(transactionData, { session });

      // Update wallet balance
      const ammount = validatedData.ammount;
      if (category.type === "income" || category.type === "debt") {
        wallet.balance += ammount;
      } else if (category.type === "expense" || category.type === "loan") {
        wallet.balance -= ammount;
      }
      await Wallet.where("_id", wallet._id).update(
        { balance: wallet.balance },
        { session }
      ); // Update wallet balance in the same transaction
    });

    return NextResponse.json(
      {
        message: "Transaction created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}
