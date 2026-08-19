import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildBaseOptions } from './database.config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...buildBaseOptions((key, fallback) =>
          config.get<string>(key, fallback),
        ),

        autoLoadEntities: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
