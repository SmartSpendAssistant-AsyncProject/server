import { ObjectId } from "mongodb";
import {
  Model,
  IMongoloquentSchema,
  IMongoloquentTimestamps,
} from "mongoloquent";
import User from "./User";

export interface IWallet extends IMongoloquentSchema, IMongoloquentTimestamps {
  name: string;
  description: string;
  type: string;
  balance: number;
  target: number;
  threshold: number;
  user_id: ObjectId;
}

export default class Wallet extends Model<IWallet> {
  /**
   * The attributes of the model.
   *
   * @var IWallet
   */
  public static $schema: IWallet;

  protected $collection: string = "wallets";

  public user() {
    return this.belongsTo(User, "user_id");
  }
  // ...
}
