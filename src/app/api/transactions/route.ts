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

// GET /api/wallets/[id]/transactions - Get transactions for specific wallet
export async function GET(request: NextRequest) {
  try {
    // Get user_id from middleware header
    const user_id = request.headers.get("x-user-id");
    if (!user_id || !ObjectId.isValid(user_id)) {
      throw new CustomError("Invalid user ID", 400);
    }

    const { searchParams } = new URL(request.url);
    const wallet_id = searchParams.get("wallet_id");
    const category_id = searchParams.get("category_id");
    const parent_id = searchParams.get("parent_id");
    const month = searchParams.get("month"); // Format: YYYY-MM
    const year = searchParams.get("year"); // Format: YYYY

    // Start with transactions from this specific wallet
    let query = Transaction.with("categories");

    // Apply filters
    if (wallet_id) {
      // Validate wallet ID
      if (!ObjectId.isValid(wallet_id)) {
        throw new CustomError("Invalid wallet ID", 400);
      }

      // Check if wallet exists and belongs to user
      const wallet = await Wallet.find(wallet_id);
      if (!wallet) {
        throw new CustomError("Wallet not found", 404);
      }

      if (wallet.user_id.toString() !== user_id) {
        throw new CustomError("Unauthorized access to wallet", 403);
      }

      query = query.with("wallet").where("wallet_id", new ObjectId(wallet_id));
    }
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
