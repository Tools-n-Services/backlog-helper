import assert from 'node:assert/strict'
import { describe, it } from 'vitest'

import { slaWarningHours } from '@config/scoring'
import { autoPriority } from '../priority'
import { firstResponseHours, slaDueAt, slaState } from '../sla'

const MS_PER_HOUR = 3_600_000

describe('автооценка приоритета', () => {
  const base = {
    severity: 'major' as const,
    frequency: 'always' as const,
    affectedCount: 100,
    segment: 'paid',
  }

  it('растёт с серьёзностью', () => {
    const blocker = autoPriority({ ...base, severity: 'blocker' })
    const minor = autoPriority({ ...base, severity: 'minor' })
    assert.ok(blocker > autoPriority(base))
    assert.ok(autoPriority(base) > minor)
  })

  it('растёт с частотой', () => {
    assert.ok(
      autoPriority({ ...base, frequency: 'always' }) >
        autoPriority({ ...base, frequency: 'once' }),
    )
  })

  it('учитывает сегмент репортера, а не только громкость', () => {
    const enterpriseFew = autoPriority({
      ...base,
      segment: 'enterprise',
      affectedCount: 10,
    })
    const freeMany = autoPriority({ ...base, segment: 'free', affectedCount: 200 })
    assert.ok(
      enterpriseFew > freeMany,
      'десять enterprise должны весить больше двух сотен бесплатных',
    )
  })

  it('охват входит логарифмом, а не линейно', () => {
    const ten = autoPriority({ ...base, affectedCount: 10 })
    const thousand = autoPriority({ ...base, affectedCount: 1000 })
    /* Рост в сто раз по охвату не должен давать рост в сто раз по приоритету:
       иначе один массовый баг вытесняет из очереди всё остальное. */
    assert.ok(thousand < ten * 4)
    assert.ok(thousand > ten)
  })

  it('не падает на нуле затронутых', () => {
    assert.equal(autoPriority({ ...base, affectedCount: 0 }), 0)
  })
})

describe('SLA первого ответа', () => {
  const now = new Date('2026-07-27T12:00:00Z')

  it('частное правило важнее общего', () => {
    assert.equal(firstResponseHours('bug', 'blocker'), 4)
    assert.equal(firstResponseHours('bug', 'minor'), 72)
    /* Баг без указанной severity всё равно попадает под правило типа. */
    assert.equal(firstResponseHours('bug', null), 48)
  })

  it('у типа без политики срока нет — и это не ноль, а его отсутствие', () => {
    assert.equal(firstResponseHours('idea', null), null)
    assert.equal(slaDueAt(new Date(), 'idea', null), null)

    const view = slaState(null, now, null)
    assert.equal(view.state, 'none')
    assert.equal(view.label, '—')
  })

  it('срок считается от момента приёма', () => {
    const created = new Date('2026-07-27T08:00:00Z')
    assert.equal(
      slaDueAt(created, 'bug', 'blocker')?.toISOString(),
      '2026-07-27T12:00:00.000Z',
    )
  })

  it('три состояния таймера', () => {
    const due = (hours: number) => new Date(now.getTime() + hours * MS_PER_HOUR)

    assert.equal(slaState(due(48), now, null).state, 'ok')
    assert.equal(slaState(due(slaWarningHours - 1), now, null).state, 'soon')
    assert.equal(slaState(due(-3), now, null).state, 'overdue')
  })

  it('ответ команды останавливает таймер', () => {
    const overdue = new Date(now.getTime() - 10 * MS_PER_HOUR)
    const view = slaState(overdue, now, new Date(now.getTime() - MS_PER_HOUR))
    assert.equal(view.state, 'answered')
    assert.equal(view.label, 'отвечено')
  })

  it('просрочка подписывается со знаком минус', () => {
    const view = slaState(new Date(now.getTime() - 5 * MS_PER_HOUR), now, null)
    assert.match(view.label, /^−/)
  })
})
