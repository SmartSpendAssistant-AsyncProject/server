import { NextRequest, NextResponse } from 'next/server';
import User from '@/models/User';
import errorHandler from '@/helpers/handleError';
import { z } from 'zod';
import { comparePassword } from '@/helpers/bcrypt';
import CustomError from '@/helpers/CustomError';
import * as jose from 'jose';

// Validation schema for login
const loginSchema = z.object({
  email: z.string().nonempty('Email is required').email('Please provide a valid email address'),
  password: z.string().nonempty('Password is required')
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input data
    const validatedData = loginSchema.parse(body);

    // Find user by email
    const user = await User.where('email', validatedData.email).first();

    if (!user) {
      throw new CustomError('Invalid email or password', 401);
    }

    // Check if password matches
    const isPasswordValid = comparePassword(validatedData.password, user.password);

    if (!isPasswordValid) {
      throw new CustomError('Invalid email or password', 401);
    }

    const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
    const _id: string = user._id.toString();

    const token = await new jose.SignJWT({ _id }).setProtectedHeader({ alg: 'HS256' }).sign(JWT_SECRET);

    return NextResponse.json(
      {
        message: 'Login successful',
        access_token: token
      },
      { status: 200 }
    );
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}
