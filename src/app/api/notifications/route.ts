import { NextRequest, NextResponse } from "next/server";
import Notification from "@/models/Notification";
import errorHandler from "@/helpers/handleError";
import { ObjectId } from "mongodb";
import CustomError from "@/helpers/CustomError";

export async function GET(request: NextRequest) {
  try {
    const user_id = request.headers.get("x-user-id");
    if (!user_id || !ObjectId.isValid(user_id)) {
      throw new CustomError("Invalid user ID", 400);
    }

    const notifications = await Notification.where(
      "user_id",
      new ObjectId(user_id)
    )
      .orderBy("createdAt", "desc")
      .get();
    return NextResponse.json(notifications);
  } catch (error) {
    const { message, status } = errorHandler(error);
    return NextResponse.json({ message }, { status });
  }
}
