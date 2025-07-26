import { ObjectId } from "mongodb";
import {
  Model,
  IMongoloquentSchema,
  IMongoloquentTimestamps,
} from "mongoloquent";
import User from "./User";
import Room from "./Room";

export interface IMessage extends IMongoloquentSchema, IMongoloquentTimestamps {
  text: string;
  chat_status: string;
  user_id?: ObjectId;
  room_id: ObjectId;
}

export default class Message extends Model<IMessage> {
  /**
   * The attributes of the model.
   *
   * @var IMessage
   */
  public static $schema: IMessage;

  protected $collection: string = "messages";
  public user() {
    return this.belongsTo(User, "user_id");
  }
  public room() {
    return this.belongsTo(Room, "room_id");
  }
  // ...
}
