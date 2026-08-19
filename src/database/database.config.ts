import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

export type EnvGetter = (key: string, fallback: string) => string;

export const entitiesGlob = __dirname + '/../**/*.entity.{ts,js}';

export const migrationsGlob = __dirname + '/../migrations/*.{ts,js}';

export const buildBaseOptions = (
  env: EnvGetter,
): Omit<PostgresConnectionOptions, 'entities'> => {
  const host = env('DB_HOST', 'localhost');

  const sslEnv = env('DB_SSL', '');
  const useSsl =
    sslEnv === 'true' || (sslEnv === '' && host.includes('rds.amazonaws.com'));

  return {
    type: 'postgres',

    host,
    port: parseInt(env('DB_PORT', '5432'), 10),
    username: env('DB_USERNAME', 'postgres'),
    password: env('DB_PASSWORD', 'password'),
    database: env('DB_NAME', 'veltrixair_web'),

    ssl: useSsl ? { rejectUnauthorized: false } : false,

    migrations: [migrationsGlob],

    synchronize: false,

    migrationsRun: false,

    logging:
      env('NODE_ENV', 'development') === 'development'
        ? ['query', 'error']
        : ['error'],

    // Store everything in UTC. The site serves KSA, UAE and India — local
    // formatting is the frontend's job, not the database's.
    extra: {
      options: '-c timezone=UTC',
    },
  };
};
