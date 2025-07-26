import { NextRequest, NextResponse } from "next/server";
import Transaction from "@/models/Transaction";
import Wallet from "@/models/Wallet";
import { ObjectId } from "mongodb";
import errorHandler from "@/helpers/handleError";
import CustomError from "@/helpers/CustomError";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

// GET /api/wallets/[id]/transactions - Get transactions for specific wallet
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get user_id from middleware header
    const user_id = request.headers.get("x-user-id");
    if (!user_id || !ObjectId.isValid(user_id)) {
      throw new CustomError("Invalid user ID", 400);
    }

    // Validate wallet ID
    if (!ObjectId.isValid(id)) {
      throw new CustomError("Invalid wallet ID", 400);
    }

    // Check if wallet exists and belongs to user
    const wallet = await Wallet.find(id);
    if (!wallet) {
      throw new CustomError("Wallet not found", 404);
    }

    if (wallet.user_id.toString() !== user_id) {
      throw new CustomError("Unauthorized access to wallet", 403);
    }

    const { searchParams } = new URL(request.url);
    const category_id = searchParams.get("category_id");
    const parent_id = searchParams.get("parent_id");
    const month = searchParams.get("month"); // Format: YYYY-MM
    const year = searchParams.get("year"); // Format: YYYY

    // Start with transactions from this specific wallet
    let query = Transaction.with("category").where(
      "wallet_id",
      new ObjectId(id)
    );

    // Apply filters
    if (category_id) {
      if (!ObjectId.isValid(category_id)) {
        throw new CustomError("Invalid category ID format", 400);
      }
      query = query.where("category_id", new ObjectId(category_id));
    }

    if (parent_id) {
      if (!ObjectId.isValid(parent_id)) {
        throw new CustomError("Invalid parent ID format", 400);
      }
      query = query.where("parent_id", new ObjectId(parent_id));
    }

    // Month and Year filtering
    if (month) {
      // Validate month format (YYYY-MM)
      if (!/^\d{4}-\d{2}$/.test(month)) {
        throw new CustomError("Invalid month format. Use YYYY-MM", 400);
      }

      const [yearFromMonth, monthNumber] = month.split("-");
      const startDate = new Date(
        `${yearFromMonth}-${monthNumber}-01T00:00:00.000Z`
      );

      // Calculate last day of the month properly
      const nextMonth = new Date(
        parseInt(yearFromMonth),
        parseInt(monthNumber), // monthNumber is already 1-based from input
        0 // Day 0 gives us the last day of previous month
      );
      const endDate = new Date(
        parseInt(yearFromMonth),
        parseInt(monthNumber) - 1, // Convert to 0-based month
        nextMonth.getDate(),
        23,
        59,
        59,
        999
      );

      query = query.where("date", ">=", startDate).where("date", "<=", endDate);
    } else if (year) {
      // Validate year format (YYYY)
      if (!/^\d{4}$/.test(year)) {
        throw new CustomError("Invalid year format. Use YYYY", 400);
      }

      const startDate = new Date(`${year}-01-01T00:00:00.000Z`);
      const endDate = new Date(`${year}-12-31T23:59:59.999Z`);

      query = query.where("date", ">=", startDate).where("date", "<=", endDate);
    }

    // Get all transactions (no pagination) with sorting by date desc
    const transactions = await query.orderBy("date", "desc").get();
    const total = transactions.length;

    const income = transactions.reduce((sum, transaction) => {
      if (
        transaction.categories &&
        (transaction.categories.type === "income" ||
          transaction.categories.type === "debt")
      ) {
        return sum + transaction.ammount;
      }
      return sum;
    }, 0);

    const expense = transactions.reduce((sum, transaction) => {
      if (
        transaction.categories &&
        (transaction.categories.type === "expense" ||
          transaction.categories.type === "loan")
      ) {
        return sum + transaction.ammount;
      }
      return sum;
    }, 0);

    const netIncome = income - expense;

    return NextResponse.json({
      message: "Wallet transactions retrieved successfully",
      wallet: {
        id: wallet._id,
        name: wallet.name,
        type: wallet.type,
        balance: wallet.balance,
      },
      summary: {
        income,
        expense,
        netIncome,
      },
      data: transactions,
      total: total,
      filter: {
        month: month || null,
        year: year || null,
        category_id: category_id || null,
        parent_id: parent_id || null,
      },
    });
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}
