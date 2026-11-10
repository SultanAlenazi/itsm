import { httpClient } from '../http-client';
import {
  CATALOG_STATUS_META, createCatalogItem, createItemVersion, deleteCatalogItem,
  getCatalogItem, listCatalogItems, listItemVersions, publishCatalogItem,
  publishItemVersion, unpublishCatalogItem, updateCatalogItem,
} from '../marketplace-catalog-api';

jest.mock('../http-client', () => ({
  httpClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

const base = '/api/v1/marketplace/catalog/items';
const client = jest.mocked(httpClient);

describe('platform marketplace catalog API', () => {
  it('passes camelCase list filters through and returns the server DTO directly', async () => {
    const response = { items: [], total: 0, page: 2, pageSize: 20, totalPages: 0 };
    const params = { status: 'draft' as const, type: 'skill' as const, search: 'audit', page: 2, pageSize: 20 };
    client.get.mockResolvedValue(response);
    await expect(listCatalogItems(params)).resolves.toBe(response);
    expect(client.get).toHaveBeenCalledWith(base, params);
  });

  it('uses resource routes for detail, version listing, and deletion', async () => {
    await getCatalogItem(42);
    await listItemVersions(42);
    await deleteCatalogItem(42);
    expect(client.get).toHaveBeenNthCalledWith(1, `${base}/42`);
    expect(client.get).toHaveBeenNthCalledWith(2, `${base}/42/versions`);
    expect(client.delete).toHaveBeenCalledWith(`${base}/42`);
  });

  it('preserves explicit false and zero values in create and partial update payloads', async () => {
    const input = { name: 'audit', type: 'skill' as const, title: 'Audit', isFree: false, price: 0 };
    await createCatalogItem(input);
    await updateCatalogItem(42, { isOfficial: false, price: 0 });
    expect(client.post).toHaveBeenCalledWith(base, input);
    expect(client.patch).toHaveBeenCalledWith(`${base}/42`, { isOfficial: false, price: 0 });
  });

  it('uses explicit publishing actions and URL encodes version identifiers', async () => {
    await publishCatalogItem(42);
    await unpublishCatalogItem(42);
    await createItemVersion(42, { version: '1.0', publish: false });
    await publishItemVersion(42, 'release/1+hotfix');
    expect(client.post.mock.calls).toEqual([
      [`${base}/42/publish`], [`${base}/42/unpublish`],
      [`${base}/42/versions`, { version: '1.0', publish: false }],
      [`${base}/42/versions/release%2F1%2Bhotfix/publish`],
    ]);
  });

  it('propagates transport failures to the caller', async () => {
    const error = new Error('Forbidden');
    client.get.mockRejectedValueOnce(error);
    await expect(getCatalogItem(42)).rejects.toBe(error);
  });

  it('provides English labels and explanations for every lifecycle state', () => {
    expect(Object.keys(CATALOG_STATUS_META)).toEqual(['draft', 'reviewing', 'published', 'rejected', 'deprecated']);
    expect(CATALOG_STATUS_META.draft.label).toBe('Draft');
    expect(CATALOG_STATUS_META.reviewing.label).toBe('Pending review');
    expect(CATALOG_STATUS_META.rejected.label).toBe('Rejected');
    for (const meta of Object.values(CATALOG_STATUS_META)) {
      expect(meta.label).toMatch(/[A-Za-z]/);
      expect(meta.hint).toMatch(/[A-Za-z]/);
      expect(`${meta.label} ${meta.hint}`).not.toMatch(/[\u3400-\u9fff]/);
    }
  });
});
