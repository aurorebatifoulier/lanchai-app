// Home hero: admin slides + built-in banners in one order (lib/heroItems.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeHeroList, visibleHeroItems, heroStateOf, type HeroState } from '../../lib/heroItems';
import type { HomeSlide } from '../../lib/homeSlides';

const banners = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const slide = (id: string, order: number, extra: Partial<HomeSlide> = {}): HomeSlide => ({
  id, placement: 'hero', imagePath: null, imageUrl: null, title: '', subtitle: '', ctaLabel: '',
  link: { kind: 'none' }, activeFrom: null, activeTo: null, order, published: true, ...extra,
});
const keys = (l: { key: string }[]) => l.map(e => e.key);
const always = () => true;

test('defaults: built-ins published, after the admin slides, in config order', () => {
  const list = mergeHeroList([slide('s2', 1), slide('s1', 0)], null, banners);
  assert.deepEqual(keys(list), ['slide:s1', 'slide:s2', 'builtIn:a', 'builtIn:b', 'builtIn:c']);
  assert.ok(list.every(e => e.published));
});

test('one shared order: stored built-in orders interleave with slides; ties → slide first', () => {
  const state: HeroState = { builtIns: { c: { order: 0 }, a: { order: 1 }, b: { order: 3 } } };
  const list = mergeHeroList([slide('s1', 1), slide('s2', 2)], state, banners);
  assert.deepEqual(keys(list), ['builtIn:c', 'slide:s1', 'builtIn:a', 'slide:s2', 'builtIn:b']);
});

test('banner-placement slides are ignored; unknown stored ids are ignored', () => {
  const state: HeroState = { builtIns: { gone: { order: 0, published: true } } };
  const list = mergeHeroList([slide('x', 0, { placement: 'banner' })], state, banners);
  assert.deepEqual(keys(list), ['builtIn:a', 'builtIn:b', 'builtIn:c']);
});

test('visible: published only, slides also within their dates', () => {
  const state: HeroState = { builtIns: { b: { published: false } } };
  const list = mergeHeroList([slide('on', 0), slide('draft', 1, { published: false }), slide('old', 2)], state, banners);
  const { items, fallback } = visibleHeroItems(list, { isActive: s => s.id !== 'old' });
  assert.equal(fallback, false);
  assert.deepEqual(keys(items), ['slide:on', 'builtIn:a', 'builtIn:c']);
});

test('preview shows everything, drafts included', () => {
  const state: HeroState = { builtIns: { b: { published: false } } };
  const list = mergeHeroList([slide('draft', 0, { published: false })], state, banners);
  const { items } = visibleHeroItems(list, { preview: true, isActive: always });
  assert.equal(items.length, 4);
  assert.equal(items.find(e => e.key === 'builtIn:b')?.published, false);
});

test('nothing published → all built-ins (fallback), never an empty hero', () => {
  const state: HeroState = { builtIns: { a: { published: false }, b: { published: false }, c: { published: false } } };
  const list = mergeHeroList([slide('draft', 0, { published: false })], state, banners);
  const { items, fallback } = visibleHeroItems(list, { isActive: always });
  assert.equal(fallback, true);
  assert.deepEqual(keys(items), ['builtIn:a', 'builtIn:b', 'builtIn:c']);
});

test('heroStateOf sanitises the stored document', () => {
  assert.deepEqual(heroStateOf(null), { builtIns: {} });
  assert.deepEqual(heroStateOf({ builtIns: { a: { published: 'yes', order: 2 }, b: 5 } }), {
    builtIns: { a: { order: 2 }, b: {} },
  });
});
