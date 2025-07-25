import { NextRequest, NextResponse } from "next/server";
import Transaction, { ITransaction } from "@/models/Transaction";
import Wallet from "@/models/Wallet";
import { ObjectId } from "mongodb";
import errorHandler from "@/helpers/handleError";
import CustomError from "@/helpers/CustomError";

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
