import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Admin } from '../auth/entities/admin.entity';
import { DepartmentMaster } from '../master-data/entities/department-master.entity';
import { OfficeMaster } from '../master-data/entities/office-master.entity';
import { AdminEmployeeController } from './admin-employee.controller';
import { EmployeeService } from './employee.service';
import { EmployeeDocument } from './entities/employee-document.entity';
import { EmployeePayslip } from './entities/employee-payslip.entity';
import { Employee } from './entities/employee.entity';

/**
 * People, as distinct from accounts.
 *
 * `employees` is the person of record: somebody is employed here whether or
 * not they can sign in, and their file — documents, payslips, reporting line —
 * outlives any login they may later be given. `auth` keeps what it was always
 * good at, which is access; this keeps who somebody is.
 *
 * `Admin` is imported read-mostly, for two narrow jobs: telling the list who
 * already has an account, and following a change of work email or name through
 * to the login created from it.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      EmployeeDocument,
      EmployeePayslip,
      DepartmentMaster,
      OfficeMaster,
      Admin,
    ]),
  ],
  controllers: [AdminEmployeeController],
  providers: [EmployeeService],
  exports: [EmployeeService],
})
export class HrModule {}
