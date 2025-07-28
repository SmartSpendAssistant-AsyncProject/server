import { NextRequest, NextResponse } from "next/server";
import Notification from "@/models/Notification";
import { z } from "zod";
import errorHandler from "@/helpers/handleError";
import { ObjectId } from "mongodb";
import CustomError from "@/helpers/CustomError";

interface RouteParams {
  params: {
    id: string;
  };
}

// Validation schema for updating notification read status
const updateNotificationSchema = z.object({
  isRead: z.boolean({
    required_error: "isRead status is required",
    invalid_type_error: "isRead must be a boolean value",
  }),
});

// PATCH /api/notifications/[id] - Update notification read status
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;
    const body = await request.json();

    // Get user_id from middleware header
    const user_id = request.headers.get("x-user-id");
    if (!user_id || !ObjectId.isValid(user_id)) {
      throw new CustomError("Invalid user ID", 400);
    }

    if (!ObjectId.isValid(id)) {
      throw new CustomError("Invalid notification ID", 400);
    }

    // Validate input data
    const validatedData = updateNotificationSchema.parse(body);

    // Find notification and check ownership
    const notification = await Notification.where("_id", new ObjectId(id))
      .where("user_id", new ObjectId(user_id))
      .first();

    if (!notification) {
      throw new CustomError(
        "Notification not found or unauthorized access",
        404
      );
    }

    // Update notification read status
    await Notification.where("_id", new ObjectId(id)).update({
      isRead: validatedData.isRead,
    });

    return NextResponse.json({
      message: "Notification status updated successfully",
    });
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    // Get user_id from middleware header
    const user_id = request.headers.get("x-user-id");
    if (!user_id || !ObjectId.isValid(user_id)) {
      throw new CustomError("Invalid user ID", 400);
    }

    if (!ObjectId.isValid(id)) {
      throw new CustomError("Invalid notification ID", 400);
    }

    // Find notification and check ownership
    const notification = await Notification.where("_id", new ObjectId(id))
      .where("user_id", new ObjectId(user_id))
      .first();

    if (!notification) {
      throw new CustomError(
        "Notification not found or unauthorized access",
        404
      );
    }
    return NextResponse.json(notification);
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}
