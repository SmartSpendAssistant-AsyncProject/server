import { NextRequest, NextResponse } from "next/server";
import Message from "@/models/Message";
import Room from "@/models/Room";
import { z } from "zod";
import errorHandler from "@/helpers/handleError";
import { ObjectId } from "mongodb";
import CustomError from "@/helpers/CustomError";
import { DB } from "mongoloquent";
import Category from "@/models/Category";
import OpenAI from "openai";
import Wallet from "@/models/Wallet";
import Transaction from "@/models/Transaction";

const client = new OpenAI();

// Validation schema for creating messages
const messageSchema = z.object({
  text: z
    .string()
    .nonempty("Message text is required")
    .min(1, "Message text cannot be empty")
    .max(1000, "Message text must not exceed 1000 characters"),
  chat_status: z.string().nonempty("Chat status is required"),
  wallet_id: z.string().nonempty("Wallet ID is required"),
});

// POST /api/messages - Create new message
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Get user_id from middleware header
    const user_id = request.headers.get("x-user-id");
    if (!user_id || !ObjectId.isValid(user_id)) {
      throw new CustomError("Invalid user ID", 400);
    }
    const categories = await Category.where(
      "user_id",
      new ObjectId(user_id)
    ).get();
    const categoryNames = categories
      .map((category) => category.name + " (" + category.type + ")")
      .join(", ");

    // Validate input data
    const validatedData = messageSchema.parse(body);

    // Validate ObjectId format for wallet_id
    if (!ObjectId.isValid(validatedData.wallet_id)) {
      throw new CustomError("Invalid wallet ID format", 400);
    }
    // Check if wallet belongs to user
    const wallet = await Wallet.where(
      "_id",
      new ObjectId(validatedData.wallet_id)
    )
      .where("user_id", new ObjectId(user_id))
      .first();
    if (!wallet) {
      throw new CustomError("Wallet not found", 404);
    }

    // Check if room exists and belongs to user
    const room = await Room.firstOrCreate({
      user_id: new ObjectId(user_id),
    });

    // Create message in a transaction block
    const aiMessage = await DB.transaction(async (session) => {
      const messageData = {
        text: validatedData.text,
        chat_status: validatedData.chat_status,
        user_id: new ObjectId(user_id),
        room_id: room._id,
        wallet_id: new ObjectId(validatedData.wallet_id),
      };

      // Create messages
      const userMessage = await Message.create(messageData, { session });

      if (userMessage.chat_status === "input") {
        const response = await client.responses.create({
          model: "gpt-4.1-nano",
          instructions: `Tugas kamu adalah mengubah kalimat user menjadi data transaksi keuangan.

          identifikasi kategori transaksi dari kalimat user.
          PENTING! hanya gunakan format JSON untuk output, jangan tambahkan teks lain selain JSON contoh:
          {
            "name": "Pembayaran listrik",
            "description": "Pembayaran tagihan listrik bulan ini",
            "ammount": 150000,
            "date": "<jika tanggal tidak disebutkan kosongkan saja, jika ada gunakan format YYYY-MM-DD>",
            "category_name": "<gunakan kategori yang sudah ada : ${categoryNames}>",
            "category_type": "<hanya gunakan income atau expense atau debt atau loan>",
            "ai_response": "<response berhasil tercatat dengan santai>"
          }
        
          jika input user tidak ada nominal uang atau tidak ada nama pengeluaran, gunakan format:
          {
            "error": "Tidak ada informasi yang dapat diidentifikasi",
            "ai_response": "<response gagal dengan santai>",
          }`,
          input: userMessage.text,
        });
        console.log("AI Response:", response);
        if (!response.output_text) {
          throw new CustomError("AI response is empty", 500);
        }

        const aiResponse = JSON.parse(response.output_text);

        // Create AI message
        const aiMessage = await Message.create(
          {
            text: aiResponse.ai_response,
            chat_status: "input",
            user_id: undefined, // AI messages do not have a user_id
            room_id: room._id,
            wallet_id: new ObjectId(validatedData.wallet_id),
          },
          { session }
        );

        // If AI response contains transaction data, create transaction
        if (aiResponse.name && aiResponse.ammount && aiResponse.category_name) {
          // Validate category ownership
          const category = await Category.where(
            "name",
            aiResponse.category_name
          )
            .where("user_id", new ObjectId(user_id))
            .first();

          if (!category) {
            throw new CustomError(
              "Category not found or unauthorized access",
              404
            );
          }

          const transactionDate = aiResponse.date
            ? new Date(
                `${aiResponse.date}T${new Date().toISOString().slice(11)}`
              )
            : new Date();

          let remaining_ammount = 0;
          if (category.type === "debt" || category.type === "loan") {
            remaining_ammount = aiResponse.ammount;
          }

          // Create transaction data
          const transactionData = {
            name: aiResponse.name,
            description: aiResponse.description || "",
            ammount: aiResponse.ammount,
            date: transactionDate,
            category_id: category._id,
            wallet_id: new ObjectId(validatedData.wallet_id),
            remaining_ammount,
            parent_id: undefined, // No parent transaction for new transactions
            message_id: aiMessage._id,
          };

          // Create transaction
          await Transaction.create(transactionData, { session });

          // Update wallet balance
          const ammount = transactionData.ammount;
          if (category.type === "income" || category.type === "debt") {
            wallet.balance += ammount;
          } else if (category.type === "expense" || category.type === "loan") {
            wallet.balance -= ammount;
          }
          await Wallet.where("_id", wallet._id).update(
            { balance: wallet.balance },
            { session }
          ); // Update wallet balance in the same transaction

          return aiMessage;
        }
      } else if (userMessage.chat_status === "ask") {
        const walletsSummary = await summarizeUserWallet(
          new ObjectId(validatedData.wallet_id)
        );
        console.log("🚀 ~ POST ~ walletSSummary:", walletsSummary);
        const chatHistory = await latestChatMessage(room._id);

        // If chat_status is "ask", create a message with the AI response
        const response = await client.responses.create({
          model: "gpt-4.1-nano",
          instructions: `Kamu adalah pakar dalam bidang finansial. 
          Tugas kamu adalah menjawab pertanyaan user, membantu mereka dalam masalah keuangan dan memberikan saran yang tepat.
          Berikut adalah data finansial user:
          ${JSON.stringify(walletsSummary, null, 2)}
          Berikut adalah 5 data history chat user terakhir:
          ${JSON.stringify(chatHistory, null, 2)}
          PENTING! hanya gunakan format teks untuk output, karena ini adalah chat, jangan gunakan format JSON atau lainnya.`,
          input: userMessage.text,
        });

        if (!response.output_text) {
          throw new CustomError("AI response is empty", 500);
        }

        // Create AI message
        const aiMessage = await Message.create(
          {
            text: response.output_text,
            chat_status: "ask",
            user_id: undefined, // AI messages do not have a user_id
            room_id: room._id,
            wallet_id: new ObjectId(validatedData.wallet_id),
          },
          { session }
        );
        return aiMessage;
      }
    });

    return NextResponse.json(
      {
        message: "Message created successfully",
        aiResponse: aiMessage,
      },
      { status: 201 }
    );
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}

async function summarizeUserWallet(wallet_id: ObjectId) {
  const wallet = await Wallet.where("_id", wallet_id).first();
  if (!wallet) {
    throw new CustomError("Wallet not found", 404);
  }

  const currentMonth = new Date().getMonth() + 1; // Months are 0-indexed in JS
  const currentYear = new Date().getFullYear();
  const month = `${currentYear}-${currentMonth.toString().padStart(2, "0")}`; // Format as YYYY-MM

  // Get all transactions for the wallet
  const transactions = await Transaction.where("wallet_id", wallet._id).get();

  // Callculate total debt and loan
  const totalDebt = transactions.reduce((sum, transaction) => {
    if (transaction.category?.type === "debt") {
      return sum + transaction.remaining_ammount;
    }
    return sum;
  }, 0);
  const totalLoan = transactions.reduce((sum, transaction) => {
    if (transaction.category?.type === "loan") {
      return sum + transaction.remaining_ammount;
    }
    return sum;
  }, 0);

  // transaction current month
  const currentMonthTransactions = await Transaction.where(
    "wallet_id",
    wallet._id
  )
    .where("date", ">=", new Date(currentYear, currentMonth - 1, 1))
    .where("date", "<", new Date(currentYear, currentMonth, 1))
    .get();

  const currentMonthIncome = currentMonthTransactions.reduce(
    (sum, transaction) => {
      if (transaction.category?.type === "income") {
        return sum + transaction.remaining_ammount;
      }
      return sum;
    },
    0
  );
  const currentMonthExpense = currentMonthTransactions.reduce(
    (sum, transaction) => {
      if (transaction.category?.type === "expense") {
        return sum + transaction.remaining_ammount;
      }
      return sum;
    },
    0
  );

  // Get transactions with categories for current month
  const currentMonthTransactionsWithCategories = await Transaction.with(
    "category"
  )
    .where("wallet_id", wallet._id)
    .where("date", ">=", new Date(currentYear, currentMonth - 1, 1))
    .where("date", "<", new Date(currentYear, currentMonth, 1))
    .get();

  // Summary per category name
  const categoryExpenseSummary: {
    [key: string]: { total: number; count: number };
  } = {};
  const categoryIncomeSummary: {
    [key: string]: { total: number; count: number };
  } = {};

  currentMonthTransactionsWithCategories.forEach((transaction) => {
    const categoryName = transaction.category?.name || "Unknown";
    const categoryType = transaction.category?.type;
    const amount = transaction.ammount;

    if (categoryType === "expense" || categoryType === "loan") {
      if (!categoryExpenseSummary[categoryName]) {
        categoryExpenseSummary[categoryName] = { total: 0, count: 0 };
      }
      categoryExpenseSummary[categoryName].total += amount;
      categoryExpenseSummary[categoryName].count += 1;
    } else if (categoryType === "income" || categoryType === "debt") {
      if (!categoryIncomeSummary[categoryName]) {
        categoryIncomeSummary[categoryName] = { total: 0, count: 0 };
      }
      categoryIncomeSummary[categoryName].total += amount;
      categoryIncomeSummary[categoryName].count += 1;
    }
  });

  return {
    currentBalance: wallet.balance,
    totalDebt,
    totalLoan,
    currentMonth: month,
    currentMonthIncome,
    currentMonthExpense,
    categoryExpenseSummaryCurrentMonth: categoryExpenseSummary || {},
    categoryIncomeSummaryCurrentMonth: categoryIncomeSummary || {},
    targetBalanceOrGoal: wallet.target || 0,
  };
}

async function latestChatMessage(room_id: ObjectId) {
  const latestMessage = await Message.where("room_id", room_id)
    .where("chat_status", "ask")
    .orderBy("createdAt", "desc")
    .limit(5)
    .get();
  const chatHistory = [];
  for (const message of latestMessage) {
    chatHistory.push({
      text: message.text,
      role: message.user_id ? "user" : "ai",
    });
  }

  return chatHistory;
}

// GET /api/messages - Get all messages for user's rooms
export async function GET(request: NextRequest) {
  try {
    // Get user_id from middleware header
    const user_id = request.headers.get("x-user-id");
    if (!user_id || !ObjectId.isValid(user_id)) {
      throw new CustomError("Invalid user ID", 400);
    }

    const { searchParams } = new URL(request.url);
    const wallet_id = searchParams.get("wallet_id");
    const chat_status = searchParams.get("chat_status");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Validate chat_status if provided
    if (chat_status && !["input", "ask"].includes(chat_status)) {
      throw new CustomError("Invalid chat_status. Use 'input' or 'ask'", 400);
    }

    // Get user's rooms
    const userRoom = await Room.where("user_id", new ObjectId(user_id)).first();

    if (!userRoom) {
      return NextResponse.json({
        message: "Messages retrieved successfully",
        data: [],
        total: 0,
        pagination: {
          limit,
          offset,
          //   hasMore: false,
        },
      });
    }

    // Start with messages query from user's room
    let query = Message.with("user").with("room");
    query = query.where("room_id", userRoom._id);

    // Filter by chat_status if provided
    if (chat_status) {
      query = query.where("chat_status", chat_status);
    }

    // Filter by wallet_id if provided
    if (wallet_id) {
      if (!ObjectId.isValid(wallet_id)) {
        throw new CustomError("Invalid wallet ID format", 400);
      }

      // Check if wallet belongs to user
      const wallet = await Wallet.where("_id", new ObjectId(wallet_id))
        .where("user_id", new ObjectId(user_id))
        .first();

      if (!wallet) {
        throw new CustomError("Wallet not found or unauthorized access", 404);
      }

      // Filter messages by wallet_id directly
      query = query.where("wallet_id", new ObjectId(wallet_id));
    }

    // Apply pagination and sorting
    const messages = await query
      .orderBy("createdAt", "desc")
      .skip(offset)
      .limit(limit)
      .get();

    const total = messages.length;

    // const hasMore = offset + limit < total;

    return NextResponse.json({
      message: "Messages retrieved successfully",
      data: messages,
      total, // Total messages in this query
      pagination: {
        limit,
        offset,
      },
      filter: {
        wallet_id: wallet_id || null,
        chat_status: chat_status || null,
      },
    });
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}
