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
  Wallet_id: z.string().nonempty("Wallet ID is required"),
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

    // Validate ObjectId format for Wallet_id
    if (!ObjectId.isValid(validatedData.Wallet_id)) {
      throw new CustomError("Invalid wallet ID format", 400);
    }
    // Check if wallet belongs to user
    const wallet = await Wallet.where(
      "_id",
      new ObjectId(validatedData.Wallet_id)
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
    await DB.transaction(async (session) => {
      const messageData = {
        text: validatedData.text,
        chat_status: validatedData.chat_status,
        user_id: new ObjectId(user_id),
        room_id: room._id,
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
            wallet_id: new ObjectId(validatedData.Wallet_id),
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
        }
      } else if (userMessage.chat_status === "ask") {
        // If chat_status is "ask", create a message with the AI response
        const response = await client.responses.create({
          model: "gpt-4.1-nano",
          instructions: `Tugas kamu adalah menjawab pertanyaan user dengan santai.
          Pertanyaan user: ${userMessage.text}`,
        });

        if (!response.output_text) {
          throw new CustomError("AI response is empty", 500);
        }

        // Create AI message
        await Message.create(
          {
            text: response.output_text,
            chat_status: "ask",
            user_id: undefined, // AI messages do not have a user_id
            room_id: room._id,
          },
          { session }
        );
      }
    });

    return NextResponse.json(
      {
        message: "Message created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}

// GET /api/messages - Get all messages for user's rooms
// export async function GET(request: NextRequest) {
//   try {
//     // Get user_id from middleware header
//     const user_id = request.headers.get("x-user-id");
//     if (!user_id || !ObjectId.isValid(user_id)) {
//       throw new CustomError("Invalid user ID", 400);
//     }

//     const { searchParams } = new URL(request.url);
//     const room_id = searchParams.get("room_id");
//     const limit = parseInt(searchParams.get("limit") || "50");
//     const offset = parseInt(searchParams.get("offset") || "0");

//     // Start with messages query
//     let query = Message.with("user").with("room");

//     // If room_id is provided, filter by room and verify ownership
//     if (room_id) {
//       if (!ObjectId.isValid(room_id)) {
//         throw new CustomError("Invalid room ID format", 400);
//       }

//       // Check if room belongs to user
//       const room = await Room.where("_id", new ObjectId(room_id))
//         .where("user_id", new ObjectId(user_id))
//         .first();

//       if (!room) {
//         throw new CustomError("Room not found or unauthorized access", 404);
//       }

//       query = query.where("room_id", new ObjectId(room_id));
//     } else {
//       // If no room_id provided, get messages from all user's rooms
//       const userRooms = await Room.where(
//         "user_id",
//         new ObjectId(user_id)
//       ).get();
//       const roomIds = userRooms.map((room) => room._id);

//       if (roomIds.length === 0) {
//         return NextResponse.json({
//           message: "Messages retrieved successfully",
//           data: [],
//           total: 0,
//           pagination: {
//             limit,
//             offset,
//             hasMore: false,
//           },
//         });
//       }

//       query = query.whereIn("room_id", roomIds);
//     }

//     // Get total count for pagination
//     const totalQuery = query.clone();
//     const total = (await totalQuery.get()).length;

//     // Apply pagination and sorting
//     const messages = await query
//       .orderBy("created_at", "desc")
//       .skip(offset)
//       .limit(limit)
//       .get();

//     const hasMore = offset + limit < total;

//     return NextResponse.json({
//       message: "Messages retrieved successfully",
//       data: messages,
//       total,
//       pagination: {
//         limit,
//         offset,
//         hasMore,
//       },
//     });
//   } catch (error) {
//     const { message, status } = errorHandler(error);
//     return Response.json({ message }, { status });
//   }
// }
