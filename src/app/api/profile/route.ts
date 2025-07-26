import CustomError from '@/helpers/CustomError';
import errorHandler from '@/helpers/handleError';
import User from '@/models/User';
import { ObjectId } from 'mongodb';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const user_id = request.headers.get('x-user-id');
    if (!user_id || !ObjectId.isValid(user_id)) {
      throw new CustomError('Invalid user ID', 400);
    }

    const user = await User.where('_id', new ObjectId(user_id)).first();

    return NextResponse.json(user);
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}
