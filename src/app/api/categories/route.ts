import CustomError from "@/helpers/CustomError";
import errorHandler from "@/helpers/handleError";
import Category from "@/models/Category";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    const user_id = request.headers.get("x-user-id");
    if (!user_id || !ObjectId.isValid(user_id)) {
      throw new CustomError("Invalid user ID", 400);
    }

    const categories = await Category.where(
      "user_id",
      new ObjectId(user_id)
    ).get();
    return Response.json(categories);
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}

const categorySchema = z.object({
  name: z.string().min(1, "Category name is required"),
  type: z.enum(["income", "expense", "debt", "loan"], {
    message: "Category type must be income or expense or debt or loan",
  }),
});

export async function POST(request: NextRequest) {
  try {
    const user_id = request.headers.get("x-user-id");
    if (!user_id || !ObjectId.isValid(user_id)) {
      throw new CustomError("Invalid user ID", 400);
    }

    const body = await request.json();
    categorySchema.parse(body);
    const { name, type } = body;

    const category = await Category.create({
      name,
      type,
      user_id: new ObjectId(user_id),
    });

    return Response.json(category, { status: 201 });
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}
