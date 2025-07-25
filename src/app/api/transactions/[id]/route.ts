import { NextRequest, NextResponse } from "next/server";
import Transaction from "@/models/Transaction";
import Wallet from "@/models/Wallet";
import Category from "@/models/Category";
import { ObjectId } from "mongodb";
import errorHandler from "@/helpers/handleError";
import CustomError from "@/helpers/CustomError";
import { DB } from "mongoloquent";

interface RouteParams {
  params: {
    id: string;
  };
}

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
