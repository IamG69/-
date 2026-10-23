import {sqliteTable,text,check} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
export const patientCards=sqliteTable('patient_cards',{
 code:text('code').primaryKey(),
 sections:text('sections').notNull(),
 updatedAt:text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
},table=>[check('sections_json',sql`json_valid(${table.sections})`)]);
export const appMeta=sqliteTable('app_meta',{
 key:text('key').primaryKey(),
 value:text('value').notNull()
});
