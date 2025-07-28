import CustomError from '@/helpers/CustomError';
import errorHandler from '@/helpers/handleError';
import Category from '@/models/Category';
import Transaction from '@/models/Transaction';
import { ObjectId } from 'mongodb';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const user_id = req.headers.get('x-user-id');
    if (!user_id || !ObjectId.isValid(user_id)) {
      throw new CustomError('Invalid user ID', 400);
    }

    const category = await Category.where('user_id', new ObjectId(user_id)).where('type', 'debt').get();
    const listCategory = category.map((e) => e._id);

    const debts = await Transaction.with('category').whereIn('category_id', listCategory).get();
    const remainingDebts = debts.filter((e) => e.remaining_ammount > 0);

    return NextResponse.json(remainingDebts);
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}
