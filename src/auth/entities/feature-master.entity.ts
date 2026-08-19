import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * An area of the system a permission can apply to.
 *
 * Codes are numbered 101–199 for staff-facing features. 201–299 is left free
 * for client-portal features, so a second subject type can be added later
 * without renumbering — a migration this project has already done once.
 */
@Entity({ name: 'feature_masters' })
@Unique('vtx_feature_masters_feature_code_unique', ['featureCode'])
export class FeatureMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_feature_masters_id_pk',
  })
  id: string;

  @Column({ name: 'feature_code', type: 'int' })
  featureCode: number;

  @Column({ name: 'feature_name', type: 'varchar', length: 50 })
  featureName: string;

  @Column({ name: 'description', type: 'varchar', length: 300, nullable: true })
  description: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date', type: 'timestamptz' })
  updatedDate: Date;
}
