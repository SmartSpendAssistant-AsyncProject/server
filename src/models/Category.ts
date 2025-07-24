import { ObjectId } from "mongodb";
import {
  Model,
  IMongoloquentSchema,
  IMongoloquentTimestamps,
} from "mongoloquent";
import User from "./User";

export interface ICategory
  extends IMongoloquentSchema,
    IMongoloquentTimestamps {
  name: string;
  type: string;
  user_id: ObjectId;
}

export default class Category extends Model<ICategory> {
  /**
   * The attributes of the model.
   *
   * @var ICategory
   */
  public static $schema: ICategory;

  protected $collection: string = "categories";
  public user() {
    return this.belongsTo(User, "user_id");
  }
  // ...
}
