import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { InjectEntityManager } from '@nestjs/typeorm';

/**
 * Human-readable tracking references, e.g. `VLX-2026-000412`.
 *
 * Backed by a Postgres sequence rather than `COUNT(*) + 1`, which races under
 * concurrent submissions and produces duplicates. Generic on purpose — careers
 * applications and discovery-call bookings will want the same mechanism with a
 * different prefix and sequence.
 */
@Injectable()
export class ReferenceNumberService {
  constructor(
    @InjectEntityManager() private readonly entityManager: EntityManager,
  ) {}

  /**
   * @param prefix        e.g. "VLX"
   * @param sequenceName  Postgres sequence to draw from
   * @param manager       pass the transactional manager to stay inside a tx
   */
  /**
   * @param padTo  digits to pad the counter to. Six by default, but the crane
   *               quote page prints `VTX-RFQ-2026-XXXX` to its customers, and
   *               the reference they are shown has to be the reference they
   *               are given.
   */
  async next(
    prefix: string,
    sequenceName: string,
    manager?: EntityManager,
    padTo = 6,
  ): Promise<string> {
    const runner = manager ?? this.entityManager;

    const rows = await runner.query<{ value: string }[]>(
      'SELECT nextval($1::regclass) AS value',
      [sequenceName],
    );

    const sequenceValue = Number(rows[0].value);
    const year = new Date().getUTCFullYear();

    return `${prefix}-${year}-${String(sequenceValue).padStart(padTo, '0')}`;
  }

  /**
   * The same draw without a year, e.g. `R-902`.
   *
   * Job postings have always numbered this way and two live adverts carry
   * R-900 and R-901. A reference that changes shape partway down a list is
   * worse than one that is merely short, so the series continues rather than
   * converting to the dated house format.
   */
  async nextShort(
    prefix: string,
    sequenceName: string,
    manager?: EntityManager,
    padTo = 3,
  ): Promise<string> {
    const runner = manager ?? this.entityManager;

    const rows = await runner.query<{ value: string }[]>(
      'SELECT nextval($1::regclass) AS value',
      [sequenceName],
    );

    return `${prefix}-${String(Number(rows[0].value)).padStart(padTo, '0')}`;
  }
}
