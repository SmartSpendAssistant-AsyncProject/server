import { ZodError } from "zod";
import CustomError from "./CustomError";

interface IResult {
  message: string;
  status: number;
}

export default function errorHandler(err: unknown): IResult {
  if (err instanceof ZodError) {
    const errors = err.issues;
    const error = errors[0];

    return { message: error.message, status: 400 };
  } else if (err instanceof CustomError) {
    const { message, status } = err;

    return { message, status };
  } else {
    return { message: "Internal Server Error", status: 500 };
  }
}
