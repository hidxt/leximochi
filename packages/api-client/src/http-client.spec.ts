import { ApiError, createApiClient } from './index';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('createApiClient', () => {
  it('成功响应解包 data 字段', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { data: { status: 'ok' } }));
    const client = createApiClient({ baseUrl: 'http://localhost:3000', fetch: fetchMock });
    await expect(client.health()).resolves.toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('错误响应抛出 ApiError 并保留错误码与 requestId', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(401, {
        error: {
          code: 'AUTH_INVALID_CREDENTIALS',
          message: '用户名或密码不正确',
          requestId: 'r-1',
        },
      }),
    );
    const client = createApiClient({ baseUrl: 'http://localhost:3000', fetch: fetchMock });
    await expect(
      client.auth.login({ username: 'a', password: 'b' }),
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      status: 401,
      requestId: 'r-1',
    });
  });

  it('非 JSON 错误响应仍抛出结构化 ApiError', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: new Headers({ 'content-type': 'text/html' }),
      json: async () => {
        throw new Error('not json');
      },
      text: async () => '<html>bad gateway</html>',
    } as unknown as Response);
    const client = createApiClient({ baseUrl: 'http://localhost:3000', fetch: fetchMock });
    await expect(client.health()).rejects.toBeInstanceOf(ApiError);
  });

  it('携带 access token 时注入 Authorization 头', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { data: { id: 'u1' } }));
    const client = createApiClient({
      baseUrl: 'http://localhost:3000',
      fetch: fetchMock,
      getAccessToken: () => 'token-abc',
    });
    await client.auth.me();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-abc');
  });

  it('401 时触发 onUnauthorized 回调', async () => {
    const onUnauthorized = jest.fn();
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(401, {
        error: { code: 'AUTH_TOKEN_INVALID', message: '登录状态无效', requestId: 'r-2' },
      }),
    );
    const client = createApiClient({
      baseUrl: 'http://localhost:3000',
      fetch: fetchMock,
      onUnauthorized,
    });
    await expect(client.auth.me()).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('查询参数被正确编码进 URL', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { data: { items: [] } }));
    const client = createApiClient({ baseUrl: 'http://localhost:3000', fetch: fetchMock });
    await client.admin.listUsers({ query: 'alice', status: 'banned', limit: 10 });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('query=alice');
    expect(url).toContain('status=banned');
    expect(url).toContain('limit=10');
  });

  it('mobile 客户端类型会带上 x-client-type 头', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { data: {} }));
    const client = createApiClient({
      baseUrl: 'http://localhost:3000',
      fetch: fetchMock,
      clientType: 'mobile',
    });
    await client.auth.login({ username: 'a', password: 'b' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-client-type']).toBe('mobile');
  });
});
