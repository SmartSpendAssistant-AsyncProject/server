import {
  Model,
  IMongoloquentSchema,
  IMongoloquentTimestamps,
} from "mongoloquent";
import Wallet from "./Wallet";
import Payment from "./Payment";
import Transaction from "./Transaction";
import Message from "./Message";
import Category from "./Category";
import Notification from "@/models/Notification";
import Room from "./Room";

export interface IUser extends IMongoloquentSchema, IMongoloquentTimestamps {
  name: string;
  username: string;
  email: string;
  password: string;
  status?: string;
  trial_due_date?: string;
}

export default class User extends Model<IUser> {
  /**
   * The attributes of the model.
   *
   * @var IUser
   */
  public static $schema: IUser;

  protected $collection: string = "users";

  protected $attributes: Partial<IUser> = {
    status: "free",
    trial_due_date: "",
  };

  public wallets() {
    return this.hasMany(Wallet, "user_id");
  }
  public payments() {
    return this.hasMany(Payment, "user_id");
  }
  public transactions() {
    return this.hasManyThrough(Transaction, Wallet, "user_id", "wallet_id");
  }
  public room() {
    return this.hasMany(Room, "user_id");
  }
  public messages() {
    return this.hasMany(Message, "user_id");
  }
  public categories() {
    return this.hasMany(Category, "user_id");
  }
  public notifications() {
    return this.hasMany(Notification, "user_id");
  }
  // ...
}
