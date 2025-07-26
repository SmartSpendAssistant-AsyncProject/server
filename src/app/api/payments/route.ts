import CustomError from '@/helpers/CustomError';
import errorHandler from '@/helpers/handleError';
import Payment from '@/models/Payment';
import User from '@/models/User';
import xenditClient from '@/services/xendit';
import { ObjectId } from 'mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { CreateInvoiceRequest, Invoice } from 'xendit-node/invoice/models';
import { DB } from 'mongoloquent';

export async function POST(request: NextRequest) {
  try {
    const user_id = request.headers.get('x-user-id');
    if (!user_id || !ObjectId.isValid(user_id)) {
      throw new CustomError('Invalid user ID', 400);
    }

    const url = await DB.transaction(async (session) => {
      const user = await User.where('_id', new ObjectId(user_id)).first();
      if (!user) {
        throw new CustomError('Unauthorized', 401);
      }

      const payment = await Payment.create({ user_id: new ObjectId(user_id) }, { session });

      const data: CreateInvoiceRequest = {
        externalId: payment._id.toString(),
        amount: 50000,
        description: 'Smart Spend Assistant (SSA) - Premium',
        currency: 'IDR',
        reminderTime: 1,
        payerEmail: user.email,
        customer: {
          id: user._id.toString(),
          email: user.email,
          givenNames: user.name
        }
      };

      const response: Invoice = await xenditClient.Invoice.createInvoice({ data });

      await Payment.where('_id', payment._id).update(
        {
          payment_url: response.invoiceUrl
        },
        { session }
      );

      return response.invoiceUrl;
    });

    return NextResponse.json({ paymentUrl: url });
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}
