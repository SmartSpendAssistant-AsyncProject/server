import {
  Model,
  IMongoloquentSchema,
  IMongoloquentTimestamps,
} from "mongoloquent";

export interface IMasterCategory
  extends IMongoloquentSchema,
    IMongoloquentTimestamps {
  name: string;
  type: string;
}

export default class MasterCategory extends Model<IMasterCategory> {
  /**
   * The attributes of the model.
   *
   * @var IMasterCategory
   */
  public static $schema: IMasterCategory;

  protected $collection: string = "masterCategories";

  // ...
}
