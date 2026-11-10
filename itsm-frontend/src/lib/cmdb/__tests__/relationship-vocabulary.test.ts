describe('CMDB relationship vocabulary', () => {
  const loadModule = () => require('../relationship-vocabulary') as typeof import('../relationship-vocabulary');

  it('provides English fallback metadata and preserves unknown type identifiers', async () => {
    const vocabulary = loadModule();
    expect(await vocabulary.loadRelationshipVocabulary()).toBe(vocabulary.DEFAULT_RELATIONSHIP_VOCABULARY);
    expect(vocabulary.relationshipLabel('hosts')).toBe('Hosting');
    expect(vocabulary.relationshipMeta('hosts')).toMatchObject({ reverse: 'hosted_on', direction: 'uni-directional' });
    expect(vocabulary.relationshipLabel('custom_relation')).toBe('custom_relation');
    expect(vocabulary.relationshipMeta('custom_relation')).toBeUndefined();
    for (const item of vocabulary.DEFAULT_RELATIONSHIP_VOCABULARY) {
      expect(item.name).toMatch(/[A-Za-z]/);
      expect(item.description).toMatch(/[A-Za-z]/);
      expect(`${item.name} ${item.description}`).not.toMatch(/[\u3400-\u9fff]/);
    }
  });

  it('merges remote metadata with defaults and exposes runtime labels', async () => {
    const vocabulary = loadModule();
    const result = await vocabulary.loadRelationshipVocabulary(async () => [
      { type: 'hosts', name: 'Runs workloads' },
      { type: 'custom_relation', name: 'Custom relation' },
    ]);
    expect(result[0]).toMatchObject({ name: 'Runs workloads', icon: 'server', reverse: 'hosted_on', description: 'Source CI hosts target CI' });
    expect(result[1]).toEqual({ type: 'custom_relation', name: 'Custom relation', description: '', direction: 'uni-directional', reverse: undefined, icon: 'link' });
    expect(vocabulary.relationshipLabel('hosts')).toBe('Runs workloads');
    expect(vocabulary.relationshipMeta('custom_relation')).toBe(result[1]);
    expect(await vocabulary.loadRelationshipVocabulary(async () => [])).toBe(result);
    expect(await vocabulary.loadRelationshipVocabulary(async () => { throw new Error('Unavailable'); })).toBe(result);
  });

  it('falls back safely when the initial remote request fails', async () => {
    const vocabulary = loadModule();
    await expect(vocabulary.loadRelationshipVocabulary(async () => { throw new Error('Unavailable'); })).resolves.toBe(vocabulary.DEFAULT_RELATIONSHIP_VOCABULARY);
  });
});
