import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { KnodeModuleMaster } from '../../master-data/entities/knode-module-master.entity';
import { KnodeDemoRequest } from './knode-demo-request.entity';

/**
 * Which kNODE products one request asked about.
 *
 * A join table rather than an array column, because "how many people are
 * waiting for Pharmacy" is the question this data exists to answer — and on a
 * text array that is a scan, while here it is an index.
 *
 * The form requires at least one, which the service enforces: an empty
 * selection would be a request about nothing.
 */
@Entity({ name: 'knode_demo_request_modules' })
@Unique('vtx_knode_demo_request_modules_unique', ['requestId', 'moduleCode'])
export class KnodeDemoRequestModule {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'vtx_knode_demo_request_modules_id_pk',
  })
  id: string;

  @Index('idx_knode_demo_request_modules_request_id')
  @Column({ name: 'request_id', type: 'uuid' })
  requestId: string;

  @ManyToOne(() => KnodeDemoRequest, (r) => r.modules, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'request_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'vtx_knode_demo_request_modules_request_id_fk',
  })
  request?: KnodeDemoRequest;

  /** Indexed on its own: the notify list is queried by module, not by request. */
  @Index('idx_knode_demo_request_modules_module_code')
  @Column({ name: 'module_code', type: 'int' })
  moduleCode: number;

  @ManyToOne(() => KnodeModuleMaster, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'module_code',
    referencedColumnName: 'moduleCode',
    foreignKeyConstraintName: 'vtx_knode_demo_request_modules_module_code_fk',
  })
  module?: KnodeModuleMaster;

  @CreateDateColumn({ name: 'created_date', type: 'timestamptz' })
  createdDate: Date;
}
