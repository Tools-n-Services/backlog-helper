/**
 * Настройки портала (В2).
 *
 * Главное здесь — порядок чтения: база поверх пресета, а не вместо него.
 * От этого зависит, переживёт ли установка обновление образа: ключ, которого
 * в её базе нет, обязан приехать из пресета, а не стать `undefined`.
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'vitest'

import { prisma } from '@/core/db'
import {
  defaultSettings,
  invalidateSettings,
  loadSettings,
  resetSetting,
  saveSetting,
  settings,
} from '@/core/settings'

const dbAvailable = await (async () => {
  if (!process.env.DATABASE_URL) return false
  try {
    await prisma.setting.count()
    return true
  } catch {
    return false
  }
})()

const suite = dbAvailable ? describe : describe.skip

suite('настройки портала', () => {
  afterEach(async () => {
    await prisma.setting.deleteMany({})
    invalidateSettings()
    await loadSettings()
  })

  it('без строк в базе портал работает на пресете', async () => {
    const loaded = await loadSettings()
    assert.deepEqual(loaded, defaultSettings())
  })

  it('сохранённое значение перекрывает пресет', async () => {
    await saveSetting('name', 'Другой портал')
    await loadSettings()

    assert.equal(settings().name, 'Другой портал')
    /* Остальное осталось от пресета: сохранение раздела не обнуляет соседей. */
    assert.equal(settings().mark, defaultSettings().mark)
  })

  it('удаление строки возвращает значение пресета', async () => {
    await saveSetting('name', 'Временное')
    await loadSettings()
    assert.equal(settings().name, 'Временное')

    await resetSetting('name')
    await loadSettings()
    assert.equal(settings().name, defaultSettings().name)
  })

  it('раздел, записанный не целиком, добирает поля из пресета', async () => {
    /* Так выглядит база установки, которую настроили до появления нового
       флага: раздел есть, а поля в нём нет. Портал обязан его получить —
       иначе обновление образа выключает возможность, которую никто
       не выключал. */
    await prisma.setting.create({ data: { key: 'features', value: { roadmap: false } } })
    invalidateSettings()
    await loadSettings()

    assert.equal(settings().features.roadmap, false)
    assert.equal(settings().features.changelog, defaultSettings().features.changelog)
  })

  it('значение неверного типа игнорируется, а не меняет поведение', async () => {
    await prisma.setting.create({
      data: { key: 'limits', value: { postsPerDay: 'пять' } },
    })
    invalidateSettings()
    await loadSettings()

    /* Лимит «пять» строкой и лимит 5 числом повели бы себя по-разному
       в сравнении: строка в jsonb — это то, что рано или поздно запишет
       редактор настроек. */
    assert.equal(settings().limits.postsPerDay, defaultSettings().limits.postsPerDay)
  })

  it('без загрузки снимка отдаются значения пресета, а не пустота', () => {
    invalidateSettings()
    /* В отличие от справочника падать здесь нельзя: настройки описывают
       оформление, и «не то название» лучше белого экрана. */
    assert.equal(settings().name, defaultSettings().name)
  })
})
