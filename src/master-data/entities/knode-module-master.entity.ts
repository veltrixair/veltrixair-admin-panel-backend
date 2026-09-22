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
 * The kNODE products somebody can ask about.
 *
 * Unlike the other five kNODE lists this carries real data rather than a
 * label: what the module is for, and whether it has shipped.
 *
 * `isLive` is the reason the demo form has two intents at all. kNODE HMS can
 * be demonstrated because it exists; Pharmacy cannot, so the most an
 * interested hospital can ask for is to be told when it arrives. The form
 * offers both against the same list, and this column is what separates them.
 *
 * `availability` stays free text ("Live now", "2 months") rather than a date,
 * because that is what the product page promises — and a roadmap date the
 * team cannot keep is worse than a vague honest one.
 */
@Entity({ name: 'knode_module_masters' })
@Unique('vtx_knode_module_masters_module_code_unique', ['moduleCode'])
export class KnodeModuleMaster {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_knode_module_masters_id_pk',
  })
  id: string;

  @Column({ name: 'site_code', type: 'int' })
  siteCode: number;

  @Column({ name: 'module_code', type: 'int' })
  moduleCode: number;

  /** Exactly as the website prints it, e.g. "kNODE LIS & RIS". */
  @Column({ name: 'module_name', type: 'varchar', length: 120 })
  moduleName: string;

  /** The one-line "who this is for" shown under the name. */
  @Column({ name: 'audience', type: 'varchar', length: 200 })
  audience: string;

  /** "Live now", "1 month", "2 months". */
  @Column({ name: 'availability', type: 'varchar', length: 60 })
  availability: string;

  @Column({ name: 'is_live', type: 'boolean', default: false })
  isLive: boolean;

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
