import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Language support needed on site — EN, AR, Hindi or Urdu. */
@Entity({ name: 'crane_translator_masters' })
@Unique('vtx_crane_translator_masters_translator_code_unique', [
  'translatorCode',
])
export class CraneTranslatorMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_crane_translator_masters_id_pk',
  })
  id: string;

  @Column({ name: 'translator_code', type: 'int' })
  translatorCode: number;

  @Column({ name: 'translator_name', type: 'varchar', length: 120 })
  translatorName: string;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
