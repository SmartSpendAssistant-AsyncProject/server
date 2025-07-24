import { ObjectId } from "mongodb";
import {
  Model,
  IMongoloquentSchema,
  IMongoloquentTimestamps,
} from "mongoloquent";
import Wallet from "./Wallet";
import Category from "./Category";
import Message from "./Message";

export interface ITransaction
  extends IMongoloquentSchema,
    IMongoloquentTimestamps {
  name: string;
  description: string;
  ammount: number;
  date: string;
  category_id: ObjectId;
  wallet_id: ObjectId;
  parent_id: ObjectId;
  remaining_ammount: number;
  message_id: ObjectId;
}

export default class Transaction extends Model<ITransaction> {
  /**
   * The attributes of the model.
   *
   * @var ITransaction
   */
  public static $schema: ITransaction;

  protected $collection: string = "transactions";
  public wallet() {
    return this.belongsTo(Wallet, "wallet_id");
  }
  public categories() {
    return this.belongsTo(Category, "category_id");
  }
  public parent() {
    return this.belongsTo(Transaction, "parent_id");
  }
  public children() {
    return this.hasMany(Transaction, "parent_id");
  }
  public message() {
    return this.belongsTo(Message, "message_id");
  }
  // ...
}
