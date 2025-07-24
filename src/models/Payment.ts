import { ObjectId } from "mongodb";
import {
  Model,
  IMongoloquentSchema,
  IMongoloquentTimestamps,
} from "mongoloquent";
import User from "./User";

export interface IPayment extends IMongoloquentSchema, IMongoloquentTimestamps {
  amount: number;
  status: string;
  paid_at: string;
  payment_url: string;
  user_id: ObjectId;
}

export default class Payment extends Model<IPayment> {
  /**
   * The attributes of the model.
   *
   * @var IPayment
   */
  public static $schema: IPayment;

  protected $collection: string = "payments";

  public user() {
    return this.belongsTo(User, "user_id");
  }
  // ...
}
