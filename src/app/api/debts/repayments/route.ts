import CustomError from '@/helpers/CustomError';
import errorHandler from '@/helpers/handleError';
import Category from '@/models/Category';
import Transaction from '@/models/Transaction';
import Wallet from '@/models/Wallet';
import { ObjectId } from 'mongodb';
import { DB } from 'mongoloquent';
import { NextRequest, NextResponse } from 'next/server';
import z from 'zod';

const transactionSchema = z.object({
  description: z.string().optional().default(''),
  ammount: z.number().positive('Amount must be a positive number'),
  wallet_id: z.string().nonempty('Wallet ID is required'),
  parent_id: z.string().nonempty('Parent ID is required'),
  date: z.date().default(new Date())
});

export async function POST(req: NextRequest) {
  try {
    const user_id = req.headers.get('x-user-id');
    const body = await req.json();
    const validatedData = transactionSchema.parse(body);

    if (!user_id || !ObjectId.isValid(user_id)) {
      throw new CustomError('Invalid user ID', 400);
    }

    const category = await Category.where('user_id', new ObjectId(user_id)).where('name', 'Repayment').first();
    if (!category) {
      throw new CustomError('Category not Found', 404);
    }

    const debt = await Transaction.where('_id', new ObjectId(validatedData.parent_id)).first();
    if (!debt) {
      throw new CustomError('Debt not Found', 404);
    }
    if (validatedData.ammount > debt.remaining_ammount || debt.remaining_ammount === 0) {
      throw new CustomError('Debt remaining ammount is exceeded', 400);
    }

    const wallet = await Wallet.where('_id', new ObjectId(validatedData.wallet_id)).first();
    if (!wallet) {
      throw new CustomError('Wallet not Found', 404);
    }

    await DB.transaction(async (session) => {
      const transactionData = {
        name: `Repayment for ${debt.name}`,
        description: validatedData.description,
        ammount: validatedData.ammount,
        date: validatedData.date,
        category_id: new ObjectId(category._id),
        wallet_id: new ObjectId(validatedData.wallet_id),
        parent_id: new ObjectId(validatedData.parent_id),
        remaining_ammount: 0
      };

      await Transaction.create(transactionData, { session });

      await Transaction.where('_id', new ObjectId(validatedData.parent_id)).update(
        { remaining_ammount: debt.remaining_ammount - validatedData.ammount },
        { session }
      );

      await Wallet.where('_id', new ObjectId(validatedData.wallet_id)).update(
        { balance: wallet.balance - validatedData.ammount },
        { session }
      );
    });

    return NextResponse.json({ message: 'Repayment success' });
  } catch (error) {
    const { message, status } = errorHandler(error);
    return Response.json({ message }, { status });
  }
}
