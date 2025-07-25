import { NextRequest, NextResponse } from "next/server";
import Transaction from "@/models/Transaction";
import Wallet from "@/models/Wallet";
import Category from "@/models/Category";
import { ObjectId } from "mongodb";
import errorHandler from "@/helpers/handleError";
import CustomError from "@/helpers/CustomError";
import { DB } from "mongoloquent";
import { z } from "zod";

interface RouteParams {
  params: {
    id: string;
  };
}

// Validation schema for updating transactions
const updateTransactionSchema = z.object({
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

// GET /api/transactions/[id] - Get transaction by ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;

    // Get user_id from middleware header
    const user_id = request.headers.get("x-user-id");
    if (!user_id || !ObjectId.isValid(user_id)) {
      throw new CustomError("Invalid user ID", 400);
    }

    if (!ObjectId.isValid(id)) {
      throw new CustomError("Invalid transaction ID", 400);
    }

    const transaction = await Transaction.with("categories")
      .with("wallet")
      .with("parent")
      .with("children")
      .where("_id", new ObjectId(id))
      .first();

    if (!transaction) {
      throw new CustomError("Transaction not found", 404);
    }

    // Check if transaction belongs to user (via wallet ownership)
    const wallet = await Wallet.find(transaction.wallet_id);
    if (!wallet || wallet.user_id.toString() !== user_id) {
      throw new CustomError("Unauthorized access to transaction", 403);
    }

    return NextResponse.json(transaction);
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}

// PUT /api/transactions/[id] - Update transaction by ID
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;
    const body = await request.json();

    // Validate input data with Zod
    const validatedData = updateTransactionSchema.parse(body);

    // Get user_id from middleware header
    const user_id = request.headers.get("x-user-id");
    if (!user_id || !ObjectId.isValid(user_id)) {
      throw new CustomError("Invalid user ID", 400);
    }

    if (!ObjectId.isValid(id)) {
      throw new CustomError("Invalid transaction ID", 400);
    }

    // Validate ObjectId format for category_id and wallet_id if provided
    if (
      validatedData.category_id &&
      !ObjectId.isValid(validatedData.category_id)
    ) {
      throw new CustomError("Invalid category ID format", 400);
    }

    if (validatedData.wallet_id && !ObjectId.isValid(validatedData.wallet_id)) {
      throw new CustomError("Invalid wallet ID format", 400);
    }

    if (validatedData.parent_id && !ObjectId.isValid(validatedData.parent_id)) {
      throw new CustomError("Invalid parent ID format", 400);
    }

    if (
      validatedData.message_id &&
      !ObjectId.isValid(validatedData.message_id)
    ) {
      throw new CustomError("Invalid message ID format", 400);
    }

    const transaction = await Transaction.with("categories")
      .where("_id", id)
      .first();
    if (!transaction) {
      throw new CustomError("Transaction not found", 404);
    }

    // Check if transaction belongs to user (via wallet ownership)
    const wallet = await Wallet.find(transaction.wallet_id);
    if (!wallet || wallet.user_id.toString() !== user_id) {
      throw new CustomError("Unauthorized access to transaction", 403);
    }

    // If wallet_id is being changed, check new wallet ownership
    if (
      validatedData.wallet_id &&
      validatedData.wallet_id !== transaction.wallet_id.toString()
    ) {
      const newWallet = await Wallet.find(validatedData.wallet_id);
      if (!newWallet || newWallet.user_id.toString() !== user_id) {
        throw new CustomError("Unauthorized access to new wallet", 403);
      }
    }

    // If category_id is being changed, check new category ownership
    if (
      validatedData.category_id &&
      validatedData.category_id !== transaction.category_id.toString()
    ) {
      const newCategory = await Category.find(validatedData.category_id);
      if (!newCategory || newCategory.user_id.toString() !== user_id) {
        throw new CustomError("Unauthorized access to new category", 403);
      }
    }

    await DB.transaction(async (session) => {
      const oldTransactionDate = transaction.date
        ? transaction.date.toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      let transactionDate: Date;

      if (oldTransactionDate === validatedData.date) {
        // If the date is the same, keep the original time
        transactionDate = transaction.date || new Date();
      } else {
        // If the date is different, use new date but keep the old time
        const oldTime = transaction.date
          ? transaction.date.toISOString().slice(11)
          : new Date().toISOString().slice(11);
        transactionDate = new Date(`${validatedData.date}T${oldTime}`);
      }

      // Get old values before update
      const oldAmount = transaction.ammount;
      const oldCategoryId = transaction.category_id;

      // Get old and new category information
      const oldCategory = await Category.find(oldCategoryId);
      const newCategory = body.category_id
        ? await Category.find(body.category_id)
        : oldCategory;

      if (!oldCategory || !newCategory) {
        throw new CustomError("Category not found", 404);
      }

      // Calculate wallet balance adjustment
      let balanceAdjustment = 0;

      // Reverse the old transaction effect
      if (oldCategory.type === "income" || oldCategory.type === "debt") {
        balanceAdjustment -= oldAmount; // Remove old income/debt
      } else if (
        oldCategory.type === "expense" ||
        oldCategory.type === "loan"
      ) {
        balanceAdjustment += oldAmount; // Remove old expense/loan
      }

      // Apply the new transaction effect
      const newAmount = body.ammount || oldAmount;
      if (newCategory.type === "income" || newCategory.type === "debt") {
        balanceAdjustment += newAmount; // Add new income/debt
      } else if (
        newCategory.type === "expense" ||
        newCategory.type === "loan"
      ) {
        balanceAdjustment -= newAmount; // Add new expense/loan
      }

      // Update wallet balance if there's a change
      if (balanceAdjustment !== 0) {
        await Wallet.where("_id", wallet._id).update(
          { balance: wallet.balance + balanceAdjustment },
          { session }
        );
      }
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
      // Update transaction
      await Transaction.where("_id", id).update(transactionData, { session });
    });

    // Get updated transaction with relations for response

    return NextResponse.json({
      message: "Transaction updated successfully",
      // data: updatedTransaction,
    });
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}

// DELETE /api/transactions/[id] - Delete transaction by ID
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;

    // Get user_id from middleware header
    const user_id = request.headers.get("x-user-id");
    if (!user_id || !ObjectId.isValid(user_id)) {
      throw new CustomError("Invalid user ID", 400);
    }

    if (!ObjectId.isValid(id)) {
      throw new CustomError("Invalid transaction ID", 400);
    }

    const transaction = await Transaction.with("categories")
      .with("children")
      .where("_id", id)
      .first();
    if (!transaction) {
      throw new CustomError("Transaction not found", 404);
    }

    // Check if transaction belongs to user (via wallet ownership)
    const wallet = await Wallet.where("_id", transaction.wallet_id).first();
    if (!wallet || wallet.user_id.toString() !== user_id) {
      throw new CustomError("Unauthorized access to transaction", 403);
    }

    await DB.transaction(async (session) => {
      // Delete children transactions first
      const children = await Transaction.where("parent_id", id).get();
      if (children && children.length > 0) {
        for (const child of children) {
          await Transaction.where("_id", child._id).delete({ session });

          // Update wallet balance for each child transaction
          const childCategory = await Category.find(child.category_id);
          if (childCategory) {
            if (
              childCategory.type === "income" ||
              childCategory.type === "debt"
            ) {
              wallet.balance -= child.ammount;
            } else if (
              childCategory.type === "expense" ||
              childCategory.type === "loan"
            ) {
              wallet.balance += child.ammount;
            }
          }
        }
      }

      // Update wallet balance for main transaction
      const ammount = transaction.ammount;
      if (
        transaction.categories &&
        (transaction.categories.type === "income" ||
          transaction.categories.type === "debt")
      ) {
        wallet.balance -= ammount;
      } else if (
        transaction.categories &&
        (transaction.categories.type === "expense" ||
          transaction.categories.type === "loan")
      ) {
        wallet.balance += ammount;
      }

      // Save the updated wallet balance
      await Wallet.where("_id", wallet._id).update(
        { balance: wallet.balance },
        { session }
      );

      // Delete the main transaction
      await Transaction.where("_id", id).delete({ session });
    });

    return NextResponse.json({
      message: "Transaction deleted successfully",
    });
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}
