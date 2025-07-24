import { NextRequest, NextResponse } from 'next/server';
import errorHandler from './helpers/handleError';
import * as jose from 'jose';
import CustomError from './helpers/CustomError';

const JWT_SECRET: string = process.env.JWT_SECRET || '';

export async function middleware(req: NextRequest) {
  try {
    if (req.nextUrl.pathname.startsWith('/api')) {
      if (!req.nextUrl.pathname.startsWith('/api/login') && !req.nextUrl.pathname.startsWith('/api/register')) {
        // From request Header
        const authHeader = req.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          throw new CustomError('Unauthorized', 401);
        }

        const jwt = authHeader.replace('Bearer ', '');
        const secret = new TextEncoder().encode(JWT_SECRET);
        const { payload } = await jose.jwtVerify<{ _id: string }>(jwt, secret);

        const requestHeaders = new Headers(req.headers);
        const response = NextResponse.next({
          request: {
            headers: requestHeaders
          }
        });
        response.headers.set('x-user-id', payload._id);

        return response;
      }
    }
  } catch (err: unknown) {
    const { message, status } = errorHandler(err);
    return Response.json({ message }, { status });
  }
}
