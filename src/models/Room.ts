import { ObjectId } from "mongodb";
import {
  Model,
  IMongoloquentSchema,
  IMongoloquentTimestamps,
} from "mongoloquent";
import User from "./User";

export interface IRoom extends IMongoloquentSchema, IMongoloquentTimestamps {
  user_id: ObjectId;
}

export default class Room extends Model<IRoom> {
  /**
   * The attributes of the model.
   *
   * @var IRoom
   */
  public static $schema: IRoom;

  protected $collection: string = "rooms";

  // ...
  public user() {
    return this.belongsTo(User, "user_id");
  }
}
