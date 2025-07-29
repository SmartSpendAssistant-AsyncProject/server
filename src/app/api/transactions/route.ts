import { NextRequest, NextResponse } from "next/server";
import Transaction from "@/models/Transaction";
import Wallet from "@/models/Wallet";
import { z } from "zod";
import errorHandler from "@/helpers/handleError";
import { ObjectId } from "mongodb";
import Category from "@/models/Category";
import CustomError from "@/helpers/CustomError";
import { DB } from "mongoloquent";
import Notification from "@/models/Notification";
import OpenAI from "openai";

const client = new OpenAI();

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

      if (category.type === "debt" || category.type === "loan") {
        validatedData.remaining_ammount = validatedData.ammount;
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

      // Create transaction
      await Transaction.create(transactionData, { session });

      // Update wallet balance
      const ammount = validatedData.ammount;
      if (category.type === "income" || category.type === "debt") {
        wallet.balance += ammount;
      } else if (category.type === "expense" || category.type === "loan") {
        wallet.balance -= ammount;
      }
      const walletNew = await Wallet.with("user")
        .where("_id", wallet._id)
        .update({ balance: wallet.balance }, { session });

      if (walletNew && walletNew?.balance <= walletNew?.threshold) {
        const response = await client.responses.create({
          model: "gpt-4.1",
          input: `Buatkan push notification ketika saldo user di bawah ${walletNew?.threshold}, dengan gaya santai dan menyemangati.
          Ballance user saat ini: ${walletNew?.balance}.
          PENTING! hanya gunakan format JSON untuk output, jangan tambahkan teks lain selain JSON contoh:
          {
            "title": "title alert wallet balance",
            "description": "deskripsi alert wallet balance",
          }
          `,
        });

        const aiResponse = JSON.parse(response.output_text);

        const notification = await Notification.create({
          user_id: walletNew.user_id,
          title: aiResponse.title,
          description: aiResponse.description,
        });
        const message = {
          to: walletNew?.user?.token,
          sound: "default",
          title: aiResponse.title,
          body: aiResponse.description,
          data: { notification },
        };
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        });
      }
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
    let query = Transaction.with("wallet").with("category");

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

      query = query.where("wallet_id", new ObjectId(wallet_id));
    }
    if (category_id) {
      if (!ObjectId.isValid(category_id)) {
        throw new CustomError("Invalid category ID format", 400);
      }
      query = query.where("category_id", new ObjectId(category_id));
    } else {
      const category = await Category.where(
        "user_id",
        new ObjectId(user_id)
      ).get();
      const listCategory = category.map((e) => e._id);
      query = query.whereIn("category_id", listCategory);
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
        transaction.category &&
        (transaction.category.type === "income" ||
          transaction.category.type === "debt")
      ) {
        return sum + transaction.ammount;
      }
      return sum;
    }, 0);

    const expense = transactions.reduce((sum, transaction) => {
      if (
        transaction.category &&
        (transaction.category.type === "expense" ||
          transaction.category.type === "loan")
      ) {
        return sum + transaction.ammount;
      }
      return sum;
    }, 0);

    const netIncome = income - expense;

    const debtCategories = await Category.where("type", "debt")
      .where("user_id", new ObjectId(user_id))
      .get();
    const listDebtCategories = debtCategories.map((category) => category._id);
    console.log("🚀 ~ GET ~ listDebtCategories:", listDebtCategories);

    const loanCategories = await Category.where("type", "loan")
      .where("user_id", new ObjectId(user_id))
      .get();
    const listLoanCategories = loanCategories.map((category) => category._id);

    const summaryAllDebtTransactions = await Transaction.whereIn(
      "category_id",
      listDebtCategories
    ).get();

    const summaryAllLoanTransactions = await Transaction.whereIn(
      "category_id",
      listLoanCategories
    ).get();

    const totalDebt = summaryAllDebtTransactions.reduce(
      (sum, transaction) => sum + transaction.remaining_ammount,
      0
    );

    const totalLoan = summaryAllLoanTransactions.reduce(
      (sum, transaction) => sum + transaction.remaining_ammount,
      0
    );

    return NextResponse.json({
      message: "Wallet transactions retrieved successfully",
      summaryData: {
        income,
        expense,
        netIncome,
      },
      summayAllTransactions: {
        totalDebt,
        totalLoan,
      },
      data: transactions,
      total: total,
      filter: {
        month: month || null,
        year: year || null,
        category_id: category_id || null,
        parent_id: parent_id || null,
        wallet_id: wallet_id || null,
      },
    });
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}
