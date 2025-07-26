import { NextRequest, NextResponse } from "next/server";
import User from "@/models/User";
import Category from "@/models/Category";
import MasterCategory from "@/models/MasterCategory";
import errorHandler from "@/helpers/handleError";
import { z } from "zod";
import { hashPassword } from "@/helpers/bcrypt";
import CustomError from "@/helpers/CustomError";
import { ObjectId } from "mongodb";

// Validation schema
const registerSchema = z.object({
  name: z
    .string()
    .nonempty("Name is required")
    .min(2, "Name must be at least 2 characters long")
    .max(50, "Name must not exceed 50 characters"),
  username: z
    .string()
    .nonempty("Username is required")
    .min(3, "Username must be at least 3 characters long")
    .max(20, "Username must not exceed 20 characters")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can only contain letters, numbers, and underscores"
    )
    .toLowerCase(),
  email: z
    .string()
    .nonempty("Email is required")
    .email("Please provide a valid email address")
    .toLowerCase(),
  password: z
    .string()
    .nonempty("Password is required")
    .min(8, "Password must be at least 8 characters long")
    .max(100, "Password must not exceed 100 characters"),
  status: z.string().optional().default("active"),
  trial_due_date: z.string().optional(),
});

/**
 * Create default categories for new user based on MasterCategory data
 */
async function createDefaultCategories(userId: ObjectId) {
  try {
    // Get all master categories
    const masterCategories = await MasterCategory.all();

    if (masterCategories.length === 0) {
      console.log("No master categories found, skipping category creation");
      return;
    }

    // Create user categories based on master categories
    const categoryPromises = masterCategories.map(async (masterCategory) => {
      const categoryData = {
        name: masterCategory.name,
        type: masterCategory.type,
        user_id: userId,
      };

      return await Category.create(categoryData);
    });

    // Execute all category creation in parallel
    await Promise.all(categoryPromises);

    console.log(
      `Created ${masterCategories.length} default categories for user ${userId}`
    );
  } catch (error) {
    console.error("Error creating default categories:", error);
    // Don't throw error here, just log it as category creation is not critical for registration
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input data
    registerSchema.parse(body);

    // Check if user already exists with same email or username
    const existingUsersname = await User.where(
      "username",
      body.username
    ).first();
    const existingUseremail = await User.where("email", body.email).first();

    if (existingUsersname) {
      throw new CustomError("Username already exists", 400);
    }
    if (existingUseremail) {
      throw new CustomError("Email already exists", 400);
    }
    // Hash password before saving
    const hashedPassword = hashPassword(body.password);

    // Create user data
    const userData = {
      ...body,
      password: hashedPassword,
    };

    const newUser = await User.create(userData);

    // Create default categories for the new user
    if (newUser._id) {
      await createDefaultCategories(newUser._id);
    }

    return NextResponse.json(
      {
        message: "Registration successful",
      },
      { status: 201 }
    );
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}
