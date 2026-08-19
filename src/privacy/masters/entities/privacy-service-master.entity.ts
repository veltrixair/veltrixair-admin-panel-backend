import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * "Service of interest" on the privacy contact form.
 *
 * `routeEmail` is the inbox this service is delivered to. All seven point at
 * info@ today; the column exists so any one of them can be split off to a
 * different practitioner without a deploy.
 */
@Entity({ name: 'privacy_service_masters' })
@Unique('vtx_privacy_service_masters_code_uq', ['serviceCode'])
export class PrivacyServiceMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_privacy_service_masters_id_pk',
  })
  id: string;

  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @Column({ name: 'service_code', type: 'int' })
  serviceCode: number;

  @Column({ name: 'service_name', type: 'varchar', length: 150 })
  serviceName: string;

  @Column({ name: 'route_email', type: 'varchar', length: 255 })
  routeEmail: string;

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
