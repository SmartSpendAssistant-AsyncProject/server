import { ObjectId } from "mongodb";
import {
  Model,
  IMongoloquentSchema,
  IMongoloquentTimestamps,
} from "mongoloquent";
import User from "./User";

export interface INotification
  extends IMongoloquentSchema,
    IMongoloquentTimestamps {
  title: string;
  description: string;
  isRead: boolean;
  user_id: ObjectId;
}

export default class Notification extends Model<INotification> {
  /**
   * The attributes of the model.
   *
   * @var INotification
   */
  public static $schema: INotification;

  protected $collection: string = "notifications";
  public user() {
    return this.belongsTo(User, "user_id");
  }
  // ...
}
