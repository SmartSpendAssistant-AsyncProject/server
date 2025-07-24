export default class CustomError extends Error {
  status: number = 500;

  constructor(message = "ISE", status = 500) {
    super(message);
    this.status = status;
  }
}
