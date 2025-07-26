import CustomError from '@/helpers/CustomError';
import errorHandler from '@/helpers/handleError';
import Payment from '@/models/Payment';
import User from '@/models/User';
import { ObjectId } from 'mongodb';
import { DB } from 'mongoloquent';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const payment = await Payment.where('_id', new ObjectId(body.external_id)).first();
    if (!payment) {
      throw new CustomError('Payment not found', 404);
    }

    if (body.status === 'PAID') {
      await DB.transaction(async (session) => {
        const payment = await Payment.where('_id', new ObjectId(body.external_id)).update(
          {
            status: 'success'
          },
          { session }
        );

        await User.where('_id', payment?.user_id).update({ status: 'premium' }, { session });
      });
    }

    return NextResponse.json({ message: 'User updated to premium' });
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}
