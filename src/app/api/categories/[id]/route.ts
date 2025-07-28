import CustomError from "@/helpers/CustomError";
import errorHandler from "@/helpers/handleError";
import Category from "@/models/Category";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { z } from "zod";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user_id = request.headers.get("x-user-id");
    if (!user_id || !ObjectId.isValid(user_id)) {
      throw new CustomError("Invalid user ID", 400);
    }

    const category = await Category.where("_id", new ObjectId(id)).first();
    if (!category) {
      throw new CustomError("Category not found", 404);
    }
    if (category.user_id.toString() !== user_id) {
      throw new CustomError("Unauthorized access to category", 403);
    }
    return Response.json(category);
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

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user_id = request.headers.get("x-user-id");
    if (!user_id || !ObjectId.isValid(user_id)) {
      throw new CustomError("Invalid user ID", 400);
    }

    if (!ObjectId.isValid(id)) {
      throw new CustomError("Invalid category ID", 400);
    }

    const body = await request.json();
    categorySchema.parse(body);
    const { name, type } = body;

    const category = await Category.where("_id", new ObjectId(id)).first();
    if (!category) {
      throw new CustomError("Category not found", 404);
    }
    if (category.user_id.toString() !== user_id) {
      throw new CustomError("Unauthorized access to category", 403);
    }

    // Update category
    await Category.where("_id", new ObjectId(id)).update({
      name,
      type,
    });

    return Response.json(
      { message: "Category updated successfully" },
      { status: 200 }
    );
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}
