import CustomError from '@/helpers/CustomError';
import errorHandler from '@/helpers/handleError';
import Payment from '@/models/Payment';
import User from '@/models/User';
import { ObjectId } from 'mongodb';
import { DB } from 'mongoloquent';
import { NextRequest, NextResponse } from 'next/server';
import z from 'zod';

const confirmationSchema = z.object({
  reference_id: z.string(),
  status: z.string()
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validatedData = confirmationSchema.parse(body.data);

    await DB.transaction(async (session) => {
      if (validatedData.status === 'SUCCEEDED') {
        const payment = await Payment.where('_id', new ObjectId(validatedData.reference_id)).update(
          {
            status: 'success'
          },
          { session }
        );

        if (!payment) {
          throw new CustomError('Unauthorized', 401);
        }

        await User.where('_id', payment.user_id).update({ status: 'premium' }, { session });
      }
    });

    return NextResponse.json({ message: 'User updated to premium' });
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}
