import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { buildBaseOptions, entitiesGlob } from './database/database.config';

const envFile =
  process.env.NODE_ENV === 'production' ? 'config/prod.env' : 'config/dev.env';
dotenv.config({ path: envFile });

export const AppDataSource = new DataSource({
  ...buildBaseOptions((key, fallback) => process.env[key] ?? fallback),
  entities: [entitiesGlob],
});
