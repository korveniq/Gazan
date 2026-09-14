"use strict";

const { z } = require("zod");

const FIELD_TYPES = [
  "string",
  "text",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "datetime",
  "uuid",
  "json",
  "enum",
  "decimal",
  "bigint",
];

const RELATION_TYPES = ["belongsTo", "hasMany", "hasOne", "belongsToMany"];

const FieldSchema = z
  .object({
    type: z.enum(FIELD_TYPES, {
      errorMap: () => ({ message: `type must be one of: ${FIELD_TYPES.join(", ")}` }),
    }),
    required: z.boolean().optional().default(false),
    nullable: z.boolean().optional().default(false),
    unique: z.boolean().optional().default(false),
    index: z.boolean().optional().default(false),
    default: z.any().optional(),
    primaryKey: z.boolean().optional().default(false),
    autoIncrement: z.boolean().optional().default(false),
    length: z.number().int().positive().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    values: z.array(z.string()).optional(),
  })
  .strict()
  .superRefine((field, ctx) => {
    if (field.type === "enum" && (!field.values || field.values.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "enum fields require a non-empty 'values' array",
        path: ["values"],
      });
    }
    if (field.autoIncrement && field.type !== "integer" && field.type !== "bigint") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "autoIncrement is only valid for 'integer' or 'bigint' fields",
        path: ["autoIncrement"],
      });
    }
  });

const RelationSchema = z
  .object({
    type: z.enum(RELATION_TYPES, {
      errorMap: () => ({ message: `relation type must be one of: ${RELATION_TYPES.join(", ")}` }),
    }),
    model: z.string().min(1),
    foreignKey: z.string().min(1).optional(),
    through: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((relation, ctx) => {
    if ((relation.type === "belongsTo" || relation.type === "hasOne" || relation.type === "hasMany") && !relation.foreignKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `relations of type '${relation.type}' require a 'foreignKey'`,
        path: ["foreignKey"],
      });
    }
    if (relation.type === "belongsToMany" && !relation.through) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "relations of type 'belongsToMany' require a 'through' join model/table name",
        path: ["through"],
      });
    }
  });

const ModelSchema = z
  .object({
    name: z.string().min(1),
    tableName: z.string().min(1).optional(),
    timestamps: z.boolean().optional().default(true),
    crud: z.boolean().optional().default(true),
    fields: z.record(z.string(), FieldSchema).refine((fields) => Object.keys(fields).length > 0, {
      message: "model must declare at least one field",
    }),
    relations: z.record(z.string(), RelationSchema).optional().default({}),
  })
  .strict();

const EntityFileSchema = z
  .object({
    models: z.array(ModelSchema).min(1, "entity.json must declare at least one model"),
  })
  .strict();

module.exports = { EntityFileSchema, ModelSchema, FieldSchema, RelationSchema, FIELD_TYPES, RELATION_TYPES };
